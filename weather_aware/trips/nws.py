"""Hourly forecasts from the US National Weather Service. No risk rules in here.

NWS needs no key and identifies an application by its User-Agent. It has no
multi-location request: each location takes a /points lookup (which grid
square it is in) and then that square's forecast. To keep the number of
requests down, forecasts are fetched once per 0.25 degree cell and shared by
every 0.1 degree cell inside it.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import httpx
from django.conf import settings
from django.core.cache import cache

from .forecast import Forecast

logger = logging.getLogger(__name__)

POINTS_URL = 'https://api.weather.gov/points/{lat},{lon}'
FETCH_CELLS_PER_DEGREE = 4
# Which grid square a location is in does not change.
POINT_CACHE_SECONDS = 30 * 24 * 60 * 60
# NWS itself marks a forecast as cacheable for an hour.
FORECAST_CACHE_SECONDS = 60 * 60

KMH_PER_MPH = 1.609344
MPS_PER_MPH = 0.44704
MM_PER_INCH = 25.4
_TO_MPH = {'wmoUnit:km_h-1': 1 / KMH_PER_MPH, 'wmoUnit:m_s-1': 1 / MPS_PER_MPH}
_TO_INCHES = {'wmoUnit:mm': 1 / MM_PER_INCH}

# ISO 8601 durations as NWS writes them: PT1H, PT6H, P2D, P3DT19H.
_DURATION = re.compile(r'^P(?:(\d+)D)?(?:T(?:(\d+)H)?)?$')


def fetch_cell(cell):
    """The 0.25 degree cell a grid cell's forecast is fetched for, as (lat, lon)."""
    n = FETCH_CELLS_PER_DEGREE
    return (round(cell[0] * n) / n, round(cell[1] * n) / n)


class NwsClient:
    timeout = 20.0
    attempts = 3
    max_parallel = 20
    # Tests swap in an httpx.MockTransport.
    transport = None

    def forecasts(self, cells, start, end):
        """Forecasts for grid cells. NWS always sends its whole range, so start and end are not used.

        Returns {cell: Forecast}. Cells whose forecast could not be fetched are
        simply absent; the caller treats them as unknown.
        """
        members = {}
        for cell in set(cells):
            members.setdefault(fetch_cell(cell), []).append(cell)

        found = {}
        missing = []
        for area in sorted(members):
            cached = cache.get(_forecast_key(area))
            if cached is not None:
                found[area] = cached
            else:
                missing.append(area)

        if missing:
            headers = {'User-Agent': settings.NWS_USER_AGENT, 'Accept': 'application/geo+json'}
            with httpx.Client(timeout=self.timeout, transport=self.transport, headers=headers) as client:
                with ThreadPoolExecutor(max_workers=self.max_parallel) as pool:
                    results = pool.map(lambda area: self._fetch(client, area, members[area]), missing)
                    for area, forecast in zip(missing, results):
                        if forecast is not None:
                            found[area] = forecast
                            cache.set(_forecast_key(area), forecast, FORECAST_CACHE_SECONDS)

        return {cell: found[area] for area in found for cell in members[area]}

    def _fetch(self, client, area, cells_in_area):
        grid_url = self._grid_url(client, area, cells_in_area)
        if grid_url is None:
            return None
        payload = self._get(client, grid_url)
        if payload is None:
            return None
        try:
            return _to_forecast(payload['properties'])
        except (KeyError, TypeError, ValueError) as error:
            logger.error('NWS forecast for %s could not be read: %s', area, error)
            return None

    def _grid_url(self, client, area, cells_in_area):
        """The forecast URL of the NWS grid square covering this area."""
        key = f'nws:point:{area[0]}:{area[1]}'
        cached = cache.get(key)
        if cached is not None:
            return cached
        # The centre of the area can be at sea or across the border while the
        # road is not, so fall back to the closest place the routes do pass.
        nearest = min(cells_in_area, key=lambda cell: (cell[0] - area[0]) ** 2 + (cell[1] - area[1]) ** 2)
        for lat, lon in dict.fromkeys([area, nearest]):
            payload = self._get(client, POINTS_URL.format(lat=f'{lat:.4f}', lon=f'{lon:.4f}'), quiet_404=True)
            url = (payload or {}).get('properties', {}).get('forecastGridData')
            if url:
                cache.set(key, url, POINT_CACHE_SECONDS)
                return url
        logger.warning('NWS has no forecast grid for %s (outside the US?)', area)
        return None

    def _get(self, client, url, quiet_404=False):
        for attempt in range(1, self.attempts + 1):
            try:
                response = client.get(url)
            except httpx.TransportError as error:
                logger.warning('NWS attempt %s failed: %s', attempt, type(error).__name__)
                continue
            if response.status_code >= 500:
                logger.warning('NWS attempt %s answered %s', attempt, response.status_code)
                continue
            if response.status_code == 404 and quiet_404:
                return None
            if response.status_code != 200:
                logger.error('NWS rejected the request: %s %s', response.status_code, response.text[:200])
                return None
            return response.json()
        return None


def _forecast_key(area):
    return f'nws:forecast:{area[0]}:{area[1]}'


def _to_forecast(properties):
    """Turn NWS's interval series into hourly lists.

    Wind applies to every hour of its interval. Rain and snow are totals for
    the interval (usually 6 hours), spread evenly to get an hourly rate.
    """
    gust = _hourly(properties['windGust'], _TO_MPH, spread=False)
    wind = _hourly(properties['windSpeed'], _TO_MPH, spread=False)
    rain = _hourly(properties['quantitativePrecipitation'], _TO_INCHES, spread=True)
    snow = _hourly(properties['snowfallAmount'], _TO_INCHES, spread=True)

    series = [gust, wind, rain, snow]
    if not all(series):
        raise ValueError('a weather series is empty')
    start = min(min(hours) for hours in series)
    end = max(max(hours) for hours in series)
    count = int((end - start).total_seconds() // 3600) + 1
    moments = [start + timedelta(hours=offset) for offset in range(count)]
    return Forecast(
        start=start,
        gust=[gust.get(moment) for moment in moments],
        wind=[wind.get(moment) for moment in moments],
        rain=[rain.get(moment) for moment in moments],
        snow=[snow.get(moment) for moment in moments],
    )


def _hourly(series, factors, spread):
    """{hour (UTC datetime): value} from one NWS series, converted with `factors`."""
    factor = factors[series['uom']]
    values = {}
    for entry in series['values']:
        begins, duration = entry['validTime'].split('/')
        match = _DURATION.match(duration)
        if not match:
            raise ValueError(f'unexpected duration {duration}')
        hours = int(match.group(1) or 0) * 24 + int(match.group(2) or 0)
        if hours < 1:
            continue
        first = datetime.fromisoformat(begins).astimezone(timezone.utc)
        value = entry['value']
        if value is not None:
            value = value * factor / (hours if spread else 1)
        for offset in range(hours):
            values[first + timedelta(hours=offset)] = value
    return values
