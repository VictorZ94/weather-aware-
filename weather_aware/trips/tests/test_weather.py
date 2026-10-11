from datetime import datetime, timedelta, timezone

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase

from trips.heatmap import build_heatmap, corridor_cells, start_hour
from trips.open_meteo import Forecast, OpenMeteoClient, grid_cell

START = datetime(2026, 10, 12, 0, 0, tzinfo=timezone.utc)


def forecast(gust, rain=None, snow=None):
    hours = len(gust)
    return Forecast(
        start=START,
        gust=gust,
        wind=[value / 2 if value is not None else None for value in gust],
        rain=rain or [0.0] * hours,
        snow=snow or [0.0] * hours,
        temperature=[10.0 + hour for hour in range(hours)],
    )


def open_meteo_payload(request, gust=10.0, rain=0.0, showers=0.0, hours=96):
    """What Open-Meteo answers: one object per requested location, in order."""
    count = len(request.url.params['latitude'].split(','))
    times = [(START + timedelta(hours=h)).strftime('%Y-%m-%dT%H:%M') for h in range(hours)]
    location = {
        'hourly': {
            'time': times,
            'wind_gusts_10m': [gust] * hours,
            'wind_speed_10m': [gust / 2] * hours,
            'rain': [rain] * hours,
            'showers': [showers] * hours,
            'snowfall': [0.0] * hours,
            'temperature_2m': [15.0] * hours,
        }
    }
    return location if count == 1 else [location] * count


class ForecastTests(SimpleTestCase):
    def test_between_two_hours_the_worse_value_is_used(self):
        f = forecast(gust=[10, 40, 20], rain=[0.3, 0.0, 0.0])

        weather = f.around(START + timedelta(minutes=30))

        self.assertEqual(weather['wind_gust_mph'], 40)  # from the later hour
        self.assertEqual(weather['rain_in'], 0.3)  # from the earlier hour
        self.assertEqual(weather['temperature_c'], 10.0)

    def test_exactly_on_the_hour_uses_that_hour_only(self):
        f = forecast(gust=[10, 40, 20])

        self.assertEqual(f.around(START)['wind_gust_mph'], 10)

    def test_outside_the_forecast_or_with_gaps_there_is_no_weather(self):
        f = forecast(gust=[10, None, 20])

        self.assertIsNone(f.around(START - timedelta(hours=1)))
        self.assertIsNone(f.around(START + timedelta(hours=5)))
        self.assertIsNone(f.around(START + timedelta(minutes=30)))  # next hour is a gap
        self.assertIsNone(f.around(START + timedelta(hours=2, minutes=30)))  # runs off the end


class OpenMeteoClientTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.requests = []

    def make_client(self, handler):
        def recording(request):
            self.requests.append(request)
            return handler(request)

        client = OpenMeteoClient()
        client.transport = httpx.MockTransport(recording)
        return client

    def test_asks_for_mph_inches_and_utc_and_adds_showers_to_rain(self):
        client = self.make_client(lambda r: httpx.Response(200, json=open_meteo_payload(r, rain=0.2, showers=0.4)))

        found = client.forecasts([(39.7, -105.0)], START, START + timedelta(hours=48))

        params = self.requests[0].url.params
        self.assertEqual(params['wind_speed_unit'], 'mph')
        self.assertEqual(params['precipitation_unit'], 'inch')
        self.assertEqual(params['timezone'], 'UTC')
        self.assertIn('showers', params['hourly'])
        self.assertEqual((params['start_date'], params['end_date']), ('2026-10-12', '2026-10-14'))
        self.assertAlmostEqual(found[(39.7, -105.0)].around(START)['rain_in'], 0.6)

    def test_nearby_points_share_a_grid_cell_and_duplicates_are_asked_once(self):
        self.assertEqual(grid_cell(39.7392, -104.9903), grid_cell(39.71, -105.04))
        client = self.make_client(lambda r: httpx.Response(200, json=open_meteo_payload(r)))

        client.forecasts([(39.7, -105.0), (39.7, -105.0), (41.1, -104.8)], START, START + timedelta(hours=48))

        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0].url.params['latitude'], '39.7,41.1')

    def test_many_cells_are_split_into_batches_of_100(self):
        client = self.make_client(lambda r: httpx.Response(200, json=open_meteo_payload(r)))
        cells = [(30 + i / 10, -100.0) for i in range(250)]

        found = client.forecasts(cells, START, START + timedelta(hours=48))

        self.assertEqual(sorted(len(r.url.params['latitude'].split(',')) for r in self.requests), [50, 100, 100])
        self.assertEqual(len(found), 250)

    def test_second_call_is_served_from_cache(self):
        client = self.make_client(lambda r: httpx.Response(200, json=open_meteo_payload(r)))

        client.forecasts([(39.7, -105.0)], START, START + timedelta(hours=48))
        client.forecasts([(39.7, -105.0)], START, START + timedelta(hours=48))

        self.assertEqual(len(self.requests), 1)

    def test_a_failing_service_leaves_cells_missing_instead_of_raising(self):
        client = self.make_client(lambda r: httpx.Response(503))

        with self.assertLogs('trips.open_meteo', level='WARNING'):
            found = client.forecasts([(39.7, -105.0)], START, START + timedelta(hours=48))

        self.assertEqual(found, {})
        self.assertEqual(len(self.requests), 2)  # one retry


class HeatmapTests(SimpleTestCase):
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
