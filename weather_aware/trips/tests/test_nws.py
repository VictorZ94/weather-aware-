import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase
from tenacity import wait_none

from here.client import HereClient
from trips.nws import NwsClient, _to_forecast, fetch_cell

from .test_endpoint import FAKE_KEY, HERE_ROUTE, URL, body

# A real NWS answer for a point north of Denver: the /points lookup and the
# grid forecast, cut down to the four series the app reads.
NWS = json.loads((Path(__file__).parent / 'fixtures' / 'nws_denver.json').read_text())
GRID_URL = NWS['point']['properties']['forecastGridData']
# The fixture's forecast starts here.
START = datetime(2026, 10, 12, 0, 0, tzinfo=timezone.utc)


def series(uom, *values):
    return {'uom': uom, 'values': [{'validTime': valid, 'value': value} for valid, value in values]}


def grid(gust=None, wind=None, rain=None, snow=None):
    whole_day = ('2026-10-12T00:00:00+00:00/P1D', 0)
    return {
        'windGust': gust or series('wmoUnit:km_h-1', whole_day),
        'windSpeed': wind or series('wmoUnit:km_h-1', whole_day),
        'quantitativePrecipitation': rain or series('wmoUnit:mm', whole_day),
        'snowfallAmount': snow or series('wmoUnit:mm', whole_day),
    }


def nws_handler(requests=None, points_status=200, grid_status=200):
    """Answers /points with the fixture's grid URL and that URL with its forecast."""

    def handle(request):
        if requests is not None:
            requests.append(request)
        if '/points/' in request.url.path:
            return httpx.Response(points_status, json=NWS['point'])
        return httpx.Response(grid_status, json=NWS['grid'])

    return handle


class NwsForecastTests(SimpleTestCase):
    def test_the_real_answer_becomes_an_hourly_forecast_in_mph_and_inches(self):
        forecast = _to_forecast(NWS['grid']['properties'])

        self.assertEqual(forecast.start, START)
        first_gust = NWS['grid']['properties']['windGust']['values'][0]['value']
        weather = forecast.at_hour(START)
        self.assertAlmostEqual(weather['wind_gust_mph'], first_gust / 1.609344)
        self.assertEqual(set(weather), {'wind_gust_mph', 'wind_speed_mph', 'rain_in', 'snow_in'})
        # About eight days, with no holes.
        usable = [forecast.at_hour(START + timedelta(hours=hour)) for hour in range(180)]
        self.assertTrue(all(usable))

    def test_wind_applies_to_every_hour_of_its_interval(self):
        gust = series(
            'wmoUnit:km_h-1',
            ('2026-10-12T00:00:00+00:00/PT2H', 80.4672),
            ('2026-10-12T02:00:00+00:00/P1DT1H', 16.09344),
        )

        forecast = _to_forecast(grid(gust=gust))

        self.assertAlmostEqual(forecast.at_hour(START)['wind_gust_mph'], 50)
        self.assertAlmostEqual(forecast.at_hour(START + timedelta(hours=1))['wind_gust_mph'], 50)
        self.assertAlmostEqual(forecast.at_hour(START + timedelta(hours=2))['wind_gust_mph'], 10)
        self.assertAlmostEqual(forecast.at_hour(START + timedelta(hours=23))['wind_gust_mph'], 10)

    def test_rain_and_snow_totals_are_spread_over_their_interval(self):
        rain = series(
            'wmoUnit:mm', ('2026-10-12T00:00:00+00:00/PT6H', 76.2), ('2026-10-12T06:00:00+00:00/PT18H', 0)
        )
        snow = series(
            'wmoUnit:mm', ('2026-10-12T00:00:00+00:00/PT6H', 304.8), ('2026-10-12T06:00:00+00:00/PT18H', 0)
        )

        forecast = _to_forecast(grid(rain=rain, snow=snow))

        # 3 inches of rain and 12 inches of snow in 6 hours.
        self.assertAlmostEqual(forecast.at_hour(START + timedelta(hours=5))['rain_in'], 0.5)
        self.assertAlmostEqual(forecast.at_hour(START + timedelta(hours=5))['snow_in'], 2.0)
        self.assertEqual(forecast.at_hour(START + timedelta(hours=6))['rain_in'], 0)

    def test_hours_nws_does_not_cover_are_unknown(self):
        gust = series('wmoUnit:km_h-1', ('2026-10-12T00:00:00+00:00/PT3H', 10))

        forecast = _to_forecast(grid(gust=gust))

        self.assertIsNotNone(forecast.at_hour(START + timedelta(hours=2)))
        self.assertIsNone(forecast.at_hour(START + timedelta(hours=3)))
        self.assertIsNone(forecast.at_hour(START - timedelta(hours=1)))

    def test_an_unknown_unit_is_refused_rather_than_guessed(self):
        gust = series('wmoUnit:kn', ('2026-10-12T00:00:00+00:00/P1D', 10))

        with self.assertRaises(KeyError):
            _to_forecast(grid(gust=gust))


@override_settings(NWS_USER_AGENT='test-app (test@example.com)')
class NwsClientTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.requests = []

    def make_client(self, **answers):
        client = NwsClient()
        client.transport = httpx.MockTransport(nws_handler(self.requests, **answers))
        return client

    def forecasts(self, client, cells):
        return client.forecasts(cells, START, START + timedelta(hours=48))

    def test_looks_up_the_grid_then_its_forecast_and_says_who_is_asking(self):
        found = self.forecasts(self.make_client(), [(39.7, -105.0)])

        self.assertEqual([r.url.path for r in self.requests], ['/points/39.7500,-105.0000', '/gridpoints/BOU/63,62'])
        self.assertTrue(all(r.headers['User-Agent'] == 'test-app (test@example.com)' for r in self.requests))
        self.assertIsNotNone(found[(39.7, -105.0)].at_hour(START))

    def test_cells_in_the_same_quarter_degree_share_one_forecast(self):
        self.assertEqual(fetch_cell((39.7, -105.0)), fetch_cell((39.8, -104.9)))
        self.assertNotEqual(fetch_cell((39.7, -105.0)), fetch_cell((40.0, -105.0)))

        found = self.forecasts(self.make_client(), [(39.7, -105.0), (39.8, -104.9), (39.7, -105.1)])

        self.assertEqual(len(self.requests), 2)
        self.assertEqual(len(found), 3)
        self.assertIs(found[(39.7, -105.0)], found[(39.8, -104.9)])

    def test_second_call_is_served_from_cache(self):
        client = self.make_client()

        self.forecasts(client, [(39.7, -105.0)])
        self.forecasts(client, [(39.7, -105.0)])

        self.assertEqual(len(self.requests), 2)

    def test_a_failing_forecast_leaves_cells_missing_instead_of_raising(self):
        client = self.make_client(grid_status=503)

        with self.assertLogs('trips.nws', level='WARNING'):
            found = self.forecasts(client, [(39.7, -105.0)])

        self.assertEqual(found, {})
        self.assertEqual(len(self.requests), 1 + 3)  # the lookup, then three tries

    def test_a_place_nws_does_not_cover_is_missing(self):
        client = self.make_client(points_status=404)

        with self.assertLogs('trips.nws', level='WARNING'):
            found = self.forecasts(client, [(30.0, -60.0)])

        self.assertEqual(found, {})

    def test_a_rejected_request_is_logged_and_not_retried(self):
        client = self.make_client(grid_status=429)

        with self.assertLogs('trips.nws', level='ERROR'):
            found = self.forecasts(client, [(39.7, -105.0)])

        self.assertEqual(found, {})
        self.assertEqual(len(self.requests), 2)


@override_settings(HERE_API_KEY=FAKE_KEY)
class PlanTripWithNwsTests(APITestCase):
    def test_a_plan_gets_its_weather_from_nws(self):
        cache.clear()
        departure = START + timedelta(hours=6, minutes=20)
        patches = [
            mock.patch.object(HereClient, 'transport', httpx.MockTransport(lambda r: httpx.Response(200, json=HERE_ROUTE))),
            mock.patch.object(HereClient, 'wait', wait_none()),
            mock.patch.object(NwsClient, 'transport', httpx.MockTransport(nws_handler())),
            mock.patch('django.utils.timezone.now', return_value=departure - timedelta(hours=1)),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

        response = self.client.post(URL, body(departure_time=departure.isoformat()), format='json')

        self.assertEqual(response.status_code, 200, response.content)
        plan = response.json()
        checkpoints = plan['routes'][0]['checkpoints']
        self.assertTrue(all(c['data_status'] == 'ok' for c in checkpoints))
        self.assertNotIn('missing_weather', [w['code'] for w in plan['warnings']])
        self.assertTrue(all(level >= 0 for row in plan['heatmap']['levels'] for level in row))
