"""What every weather source hands the rest of the pipeline. No risk rules in here.

Locations are snapped to a 0.1 degree grid so nearby checkpoints share one
forecast.
"""

from datetime import timedelta


def grid_cell(lat, lon):
    """The 0.1 degree grid cell a coordinate falls in, as (lat, lon)."""
    return (round(lat, 1), round(lon, 1))


class Forecast:
    """Hourly values for one grid cell, starting at `start` (UTC, on the hour)."""

    def __init__(self, start, gust, wind, rain, snow):
        self.start = start
        self.gust = gust
        self.wind = wind
        self.rain = rain
        self.snow = snow

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
        }

    def around(self, moment):
        """Weather at an arbitrary time: the worse of the two forecast hours around it."""
        earlier = self.at_hour(moment)
        on_the_hour = moment.minute == 0 and moment.second == 0
        later = earlier if on_the_hour else self.at_hour(moment + timedelta(hours=1))
        if earlier is None or later is None:
            return None
        return {key: max(earlier[key], later[key]) for key in earlier}
