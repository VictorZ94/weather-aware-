from datetime import datetime, timedelta, timezone

import httpx
from django.test import SimpleTestCase

from trips.forecast import Forecast, grid_cell
from trips.heatmap import build_heatmap, corridor_cells, start_hour

START = datetime(2026, 10, 12, 0, 0, tzinfo=timezone.utc)


def forecast(gust, rain=None, snow=None):
    hours = len(gust)
    return Forecast(
        start=START,
        gust=gust,
        wind=[value / 2 if value is not None else None for value in gust],
        rain=rain or [0.0] * hours,
        snow=snow or [0.0] * hours,
    )


def nws_answer(gust=10.0, rain=0.0, hours=96):
    """What NWS answers for a grid forecast, given gusts in mph and rain in inches per hour."""

    def series(uom, value):
        return {'uom': uom, 'values': [{'validTime': f'{START.isoformat()}/PT{hours}H', 'value': value}]}

    return {
        'properties': {
            'windGust': series('wmoUnit:km_h-1', gust * 1.609344),
            'windSpeed': series('wmoUnit:km_h-1', gust / 2 * 1.609344),
            'quantitativePrecipitation': series('wmoUnit:mm', rain * hours * 25.4),
            'snowfallAmount': series('wmoUnit:mm', 0),
        }
    }


def nws_handler(requests=None, status=200, **weather):
    """A fake NWS: any /points lookup leads to one grid forecast with this weather."""

    def handle(request):
        if requests is not None:
            requests.append(request)
        if status != 200:
            return httpx.Response(status)
        if '/points/' in request.url.path:
            grid = 'https://api.weather.gov/gridpoints/TST/1,1'
            return httpx.Response(200, json={'properties': {'forecastGridData': grid}})
        return httpx.Response(200, json=nws_answer(**weather))

    return handle


class ForecastTests(SimpleTestCase):
    def test_between_two_hours_the_worse_value_is_used(self):
        f = forecast(gust=[10, 40, 20], rain=[0.3, 0.0, 0.0])

        weather = f.around(START + timedelta(minutes=30))

        self.assertEqual(weather['wind_gust_mph'], 40)  # from the later hour
        self.assertEqual(weather['rain_in'], 0.3)  # from the earlier hour

    def test_exactly_on_the_hour_uses_that_hour_only(self):
        f = forecast(gust=[10, 40, 20])

        self.assertEqual(f.around(START)['wind_gust_mph'], 10)

    def test_outside_the_forecast_or_with_gaps_there_is_no_weather(self):
        f = forecast(gust=[10, None, 20])

        self.assertIsNone(f.around(START - timedelta(hours=1)))
        self.assertIsNone(f.around(START + timedelta(hours=5)))
        self.assertIsNone(f.around(START + timedelta(minutes=30)))  # next hour is a gap
        self.assertIsNone(f.around(START + timedelta(hours=2, minutes=30)))  # runs off the end


class HeatmapTests(SimpleTestCase):
    def test_nearby_points_share_a_grid_cell(self):
        self.assertEqual(grid_cell(39.7392, -104.9903), grid_cell(39.71, -105.04))

    def test_hour_zero_is_the_departure_rounded_down(self):
        departure = datetime(2026, 10, 12, 6, 47, 12, tzinfo=timezone.utc)

        self.assertEqual(start_hour(departure), datetime(2026, 10, 12, 6, 0, tzinfo=timezone.utc))

    def test_49_levels_per_point_using_the_rules_and_cargo_weight(self):
        gusts = [10.0] * 96
        gusts[5] = 38.0  # High, or Severe with cargo over 40,000 lb
        cells = {(39.7, -105.0), (41.1, -104.8)}
        forecasts = {(39.7, -105.0): forecast(gust=gusts)}  # the other cell has no forecast

        light = build_heatmap(cells, forecasts, START, cargo_lb=20_000)
        heavy = build_heatmap(cells, forecasts, START, cargo_lb=42_000)

        self.assertEqual(light['points'], [[-105.0, 39.7], [-104.8, 41.1]])  # [lon, lat]
        self.assertEqual([len(row) for row in light['levels']], [49, 49])
        self.assertEqual(light['levels'][0][5], 2)
        self.assertEqual(heavy['levels'][0][5], 3)
        self.assertEqual(light['levels'][0][4], 0)
        self.assertEqual(set(light['levels'][1]), {-1})

    def test_corridor_cells_have_no_gaps_on_a_long_straight_stretch(self):
        from .test_sampling import straight_route
        from trips.sampling import build_profile

        # Only 3 points over 200 miles: consecutive points are many cells apart.
        cells = corridor_cells([build_profile(straight_route(200, points=3))])

        longitudes = sorted(lon for _, lon in cells)
        self.assertGreater(len(cells), 30)
        self.assertTrue(all(b - a < 0.11 for a, b in zip(longitudes, longitudes[1:])))
