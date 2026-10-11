"""Hourly forecasts from Open-Meteo. No risk rules in here.

Locations are snapped to a 0.1 degree grid so nearby checkpoints share one
forecast, and requested in batches.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import httpx
from django.core.cache import cache

logger = logging.getLogger(__name__)

FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
BATCH_SIZE = 100
CACHE_SECONDS = 60 * 60
# `showers` is convective rain (downpours), which Open-Meteo reports
# separately from `rain`. The rules need both together.
HOURLY = 'wind_gusts_10m,wind_speed_10m,rain,showers,snowfall,temperature_2m'


def grid_cell(lat, lon):
    """The 0.1 degree grid cell a coordinate falls in, as (lat, lon)."""
    return (round(lat, 1), round(lon, 1))


class Forecast:
    """Hourly values for one grid cell, starting at `start` (UTC, on the hour)."""

    def __init__(self, start, gust, wind, rain, snow, temperature):
        self.start = start
        self.gust = gust
        self.wind = wind
        self.rain = rain
        self.snow = snow
        self.temperature = temperature

    def at_hour(self, moment):
        """Weather for the forecast hour containing `moment`, or None if not covered."""
        index = int((moment - self.start).total_seconds() // 3600)
        if moment < self.start or index >= len(self.gust):
            return None
        values = (self.gust[index], self.wind[index], self.rain[index], self.snow[index])
        if any(value is None for value in values):
            return None
        return {
            'wind_gust_mph': values[0],
            'wind_speed_mph': values[1],
            'rain_in': values[2],
            'snow_in': values[3],
            'temperature_c': self.temperature[index],
        }

    def around(self, moment):
        """Weather at an arbitrary time: the worse of the two forecast hours around it.

        Temperature is informational and taken from the earlier hour.
        """
        earlier = self.at_hour(moment)
        on_the_hour = moment.minute == 0 and moment.second == 0
        later = earlier if on_the_hour else self.at_hour(moment + timedelta(hours=1))
        if earlier is None or later is None:
            return None
        worse = {key: max(earlier[key], later[key]) for key in earlier if key != 'temperature_c'}
        worse['temperature_c'] = earlier['temperature_c']
        return worse


class OpenMeteoClient:
    timeout = 20.0
    attempts = 2
    max_parallel = 5
    # Tests swap in an httpx.MockTransport.
    transport = None

    def forecasts(self, cells, start, end):
        """Forecasts for grid cells covering start..end (UTC datetimes).

        Returns {cell: Forecast}. Cells whose forecast could not be fetched are
        simply absent; the caller treats them as unknown.
        """
        start_date = start.astimezone(timezone.utc).date()
        end_date = end.astimezone(timezone.utc).date()
        key = lambda cell: f'openmeteo:{cell[0]}:{cell[1]}:{start_date}:{end_date}'  # noqa: E731

        found = {}
        missing = []
        for cell in sorted(set(cells)):
            cached = cache.get(key(cell))
            if cached is not None:
                found[cell] = cached
            else:
                missing.append(cell)

        batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
        if batches:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                with ThreadPoolExecutor(max_workers=self.max_parallel) as pool:
                    results = pool.map(lambda batch: self._fetch(client, batch, start_date, end_date), batches)
                    for fetched in results:
                        for cell, forecast in fetched.items():
                            found[cell] = forecast
                            cache.set(key(cell), forecast, CACHE_SECONDS)
        return found

    def _fetch(self, client, batch, start_date, end_date):
        params = {
            'latitude': ','.join(str(lat) for lat, _ in batch),
            'longitude': ','.join(str(lon) for _, lon in batch),
            'hourly': HOURLY,
            'wind_speed_unit': 'mph',
            'precipitation_unit': 'inch',
            'timezone': 'UTC',
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
        }
        for attempt in range(1, self.attempts + 1):
            try:
                response = client.get(FORECAST_URL, params=params)
            except httpx.TransportError as error:
                logger.warning('Open-Meteo attempt %s failed: %s', attempt, type(error).__name__)
                continue
            if response.status_code >= 500:
                logger.warning('Open-Meteo attempt %s answered %s', attempt, response.status_code)
                continue
            if response.status_code != 200:
                logger.error('Open-Meteo rejected the request: %s %s', response.status_code, response.text[:200])
                return {}
            payload = response.json()
            # One location comes back as an object, several as a list, in request order.
            locations = payload if isinstance(payload, list) else [payload]
            if len(locations) != len(batch):
                logger.error('Open-Meteo returned %s locations for %s requested', len(locations), len(batch))
                return {}
            return {cell: _to_forecast(location) for cell, location in zip(batch, locations)}
        return {}


def _to_forecast(location):
    hourly = location['hourly']
    start = datetime.fromisoformat(hourly['time'][0]).replace(tzinfo=timezone.utc)
    rain = [
        None if rain is None or showers is None else rain + showers
        for rain, showers in zip(hourly['rain'], hourly['showers'])
    ]
    return Forecast(
        start=start,
        gust=hourly['wind_gusts_10m'],
        wind=hourly['wind_speed_10m'],
        rain=rain,
        snow=hourly['snowfall'],
        temperature=hourly['temperature_2m'],
    )
