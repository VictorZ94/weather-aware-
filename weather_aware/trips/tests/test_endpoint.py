import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import httpx
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from tenacity import wait_none

from here.client import HereClient
from trips.open_meteo import OpenMeteoClient

from .test_weather import START, open_meteo_payload

URL = '/api/trips/plan/'
FAKE_KEY = 'test-here-key'
# A real HERE answer for Denver -> Cheyenne (one route, about 103 miles).
HERE_ROUTE = json.loads((Path(__file__).parent / 'fixtures' / 'here_denver_cheyenne.json').read_text())

DENVER = {'id': 'denver', 'label': 'Denver, CO', 'lat': 39.7392, 'lon': -104.9903, 'timezone': 'America/Denver'}
CHEYENNE = {'id': 'cheyenne', 'label': 'Cheyenne, WY', 'lat': 41.14, 'lon': -104.8202, 'timezone': 'America/Denver'}
# Inside the fake forecast, which starts at START.
DEPARTURE = START + timedelta(hours=6, minutes=20)

LEVELS = {'low', 'moderate', 'high', 'severe', 'no_travel'}


def body(**changes):
    request = {
        'origin': DENVER,
        'destination': CHEYENNE,
        'departure_time': DEPARTURE.isoformat(),
        'load_weight_kg': 9000,
        'checkpoint_interval_miles': 25,
    }
    request.update(changes)
    return request


@override_settings(HERE_API_KEY=FAKE_KEY)
class PlanTripTests(APITestCase):
    def setUp(self):
        # Also resets the throttle counters, which live in the cache.
        cache.clear()
        self.here_requests = []
        self.here_answer = httpx.Response(200, json=HERE_ROUTE)
        self.weather = {'gust': 10.0}
        self.weather_status = 200

        def here(request):
            self.here_requests.append(request)
            if isinstance(self.here_answer, Exception):
                raise self.here_answer
            return self.here_answer

        def open_meteo(request):
            if self.weather_status != 200:
                return httpx.Response(self.weather_status)
            return httpx.Response(200, json=open_meteo_payload(request, **self.weather))

        patches = [
            mock.patch.object(HereClient, 'transport', httpx.MockTransport(here)),
            mock.patch.object(HereClient, 'wait', wait_none()),
            mock.patch.object(OpenMeteoClient, 'transport', httpx.MockTransport(open_meteo)),
            # "Now" is just before the departure, so the fixed test dates are valid.
            mock.patch('django.utils.timezone.now', return_value=DEPARTURE - timedelta(hours=1)),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def plan(self, **changes):
        return self.client.post(URL, body(**changes), format='json')

    # --- the response ---

    def test_response_has_every_field_of_the_contract(self):
        response = self.plan()

        self.assertEqual(response.status_code, 200)
        plan = response.json()
        self.assertEqual(
            set(plan),
            {'origin', 'destination', 'departure_time', 'checkpoint_interval_miles', 'recommended_route_id',
             'recommendation_reason', 'warnings', 'routes', 'heatmap'},
        )  # fmt: skip
        self.assertEqual(plan['origin'], DENVER)
        self.assertEqual(plan['checkpoint_interval_miles'], 25)

        route = plan['routes'][0]
        self.assertEqual(
            set(route),
            {'id', 'name', 'geometry', 'distance_miles', 'duration_minutes', 'arrival_time', 'rank',
             'average_risk', 'miles_by_level', 'worst_segment', 'checkpoints'},
        )  # fmt: skip
        self.assertEqual(route['rank'], 1)
        self.assertEqual(route['name'], 'via I-25')
        self.assertAlmostEqual(route['distance_miles'], 102.7, delta=0.1)
        self.assertEqual(route['geometry']['type'], 'LineString')
        self.assertEqual(set(route['miles_by_level']), LEVELS | {'unknown'})

        checkpoint = route['checkpoints'][1]
        self.assertEqual(
            set(checkpoint),
            {'id', 'seq', 'mile', 'lat', 'lon', 'eta', 'timezone', 'miles_represented', 'risk_level', 'levels',
             'deciding_condition', 'load_rule', 'data_status', 'weather'},
        )  # fmt: skip
        self.assertEqual(checkpoint['risk_level'], 'low')
        self.assertEqual(checkpoint['levels'], {'wind': 'low', 'rain': 'low', 'snow': 'low'})
        self.assertEqual(checkpoint['data_status'], 'ok')
        self.assertEqual(
            set(checkpoint['weather']),
            {'wind_gust_mph', 'wind_speed_mph', 'rain_in', 'snow_in', 'temperature_c'},
        )

    def test_line_is_lon_lat_from_origin_to_destination(self):
        coordinates = self.plan().json()['routes'][0]['geometry']['coordinates']

        self.assertAlmostEqual(coordinates[0][0], DENVER['lon'], delta=0.02)
        self.assertAlmostEqual(coordinates[0][1], DENVER['lat'], delta=0.02)
        self.assertAlmostEqual(coordinates[-1][0], CHEYENNE['lon'], delta=0.02)
        self.assertAlmostEqual(coordinates[-1][1], CHEYENNE['lat'], delta=0.02)

    def test_checkpoints_follow_the_interval_and_end_at_the_arrival(self):
        for interval in (10, 25, 50):
            cache.clear()
            route = self.plan(checkpoint_interval_miles=interval).json()['routes'][0]
            checkpoints = route['checkpoints']

            self.assertEqual(len(checkpoints), math.ceil(route['distance_miles'] / interval) + 1)
            self.assertEqual(checkpoints[0]['mile'], 0)
            self.assertEqual(checkpoints[-1]['mile'], route['distance_miles'])
            etas = [c['eta'] for c in checkpoints]
            self.assertEqual(etas, sorted(set(etas)))
            self.assertTrue(all(eta.endswith('Z') for eta in etas))
            self.assertEqual(etas[-1], route['arrival_time'])
            self.assertAlmostEqual(sum(c['miles_represented'] for c in checkpoints), route['distance_miles'], delta=0.1)
            self.assertAlmostEqual(sum(route['miles_by_level'].values()), route['distance_miles'], delta=0.5)

    def test_arrival_is_departure_plus_the_drive(self):
        plan = self.plan().json()
        route = plan['routes'][0]

        arrival = datetime.fromisoformat(route['arrival_time'].replace('Z', '+00:00'))
        self.assertAlmostEqual((arrival - DEPARTURE).total_seconds() / 60, route['duration_minutes'], delta=1)
        self.assertEqual(plan['departure_time'], '2026-10-12T06:20:00Z')

    def test_wind_and_cargo_weight_set_the_risk(self):
        self.weather = {'gust': 38.0}

        light = self.plan(load_weight_kg=9000).json()['routes'][0]  # about 19,800 lb
        cache.clear()
        heavy = self.plan(load_weight_kg=19051).json()['routes'][0]  # about 42,000 lb

        self.assertEqual(light['checkpoints'][0]['risk_level'], 'high')
        self.assertIsNone(light['checkpoints'][0]['load_rule'])
        self.assertEqual(light['average_risk'], 2)
        self.assertEqual(heavy['checkpoints'][0]['risk_level'], 'severe')
        self.assertIn('40,000 lb', heavy['checkpoints'][0]['load_rule'])
        self.assertEqual(heavy['checkpoints'][0]['deciding_condition'], 'Wind gusts 38 mph')
        self.assertEqual(heavy['average_risk'], 3)
        self.assertEqual(heavy['worst_segment']['risk_level'], 'severe')
        self.assertAlmostEqual(heavy['worst_segment']['to_mile'], heavy['distance_miles'], delta=0.1)

    def test_exactly_40000_lb_entered_in_the_form_is_not_over_40000(self):
        self.weather = {'gust': 38.0}

        # What the form sends for 40,000 lb. Converted back it is 39,999.99 lb.
        route = self.plan(load_weight_kg=18143.69).json()['routes'][0]

        self.assertEqual(route['checkpoints'][0]['risk_level'], 'high')

    def test_single_route_is_recommended_with_a_fewer_routes_warning(self):
        plan = self.plan().json()

        self.assertEqual(plan['recommended_route_id'], plan['routes'][0]['id'])
        self.assertEqual(plan['recommendation_reason'], 'The only truck route available.')
        self.assertEqual([w['code'] for w in plan['warnings']], ['fewer_routes'])

    def test_no_travel_everywhere_adds_the_warning(self):
        self.weather = {'gust': 60.0}

        plan = self.plan().json()

        self.assertEqual(plan['routes'][0]['checkpoints'][0]['risk_level'], 'no_travel')
        self.assertIn('no_travel_all_routes', [w['code'] for w in plan['warnings']])
        self.assertIn('later departure', plan['recommendation_reason'])

    def test_heatmap_covers_49_hours_from_the_departure_hour(self):
        self.weather = {'gust': 38.0}

        heatmap = self.plan().json()['heatmap']

        self.assertEqual(heatmap['hour0'], '2026-10-12T06:00:00Z')
        self.assertGreater(len(heatmap['points']), 10)
        self.assertEqual(len(heatmap['levels']), len(heatmap['points']))
        self.assertTrue(all(row == [2] * 49 for row in heatmap['levels']))
        lon, lat = heatmap['points'][0]
        self.assertTrue(-106 < lon < -104 and 39 < lat < 42)

    def test_weather_outage_still_returns_routes_marked_unknown(self):
        self.weather_status = 503

        with self.assertLogs('trips.open_meteo', level='WARNING'):
            response = self.plan()

        self.assertEqual(response.status_code, 200)
        plan = response.json()
        route = plan['routes'][0]
        self.assertTrue(all(c['risk_level'] is None and c['weather'] is None for c in route['checkpoints']))
        self.assertTrue(all(c['data_status'] == 'missing' for c in route['checkpoints']))
        self.assertIsNone(route['average_risk'])
        self.assertAlmostEqual(route['miles_by_level']['unknown'], route['distance_miles'], delta=0.5)
        self.assertIsNone(plan['recommended_route_id'])
        self.assertIn('missing_weather', [w['code'] for w in plan['warnings']])
        self.assertTrue(all(set(row) == {-1} for row in plan['heatmap']['levels']))

    # --- what is sent to HERE ---

    def test_here_gets_a_truck_request_with_gross_weight_and_profile(self):
        self.plan(load_weight_kg=10000)

        params = self.here_requests[0].url.params
        self.assertEqual(self.here_requests[0].url.host, 'router.hereapi.com')
        self.assertEqual(params['transportMode'], 'truck')
        self.assertEqual(params['alternatives'], '2')
        self.assertEqual(params['origin'], '39.7392,-104.9903')
        self.assertEqual(params['departureTime'], '2026-10-12T06:20:00+00:00')
        # 10,000 kg cargo + 35,000 lb (15,876 kg) empty truck
        self.assertEqual(params['vehicle[grossWeight]'], '25876')
        self.assertEqual(params['vehicle[height]'], '411')
        self.assertEqual(params['vehicle[axleCount]'], '5')
        self.assertIn('duration', params['spans'])

    def test_identical_request_calls_here_once(self):
        self.plan()
        self.plan()

        self.assertEqual(len(self.here_requests), 1)

    # --- validation ---

    def assert_field_error(self, response, field):
        self.assertEqual(response.status_code, 422)
        self.assertEqual(list(response.json()['field_errors']), [field])
        self.assertFalse(response.json()['retryable'])
        self.assertEqual(self.here_requests, [])

    def test_invalid_places(self):
        self.assert_field_error(self.plan(origin=None), 'origin')
        self.assert_field_error(self.plan(destination={**CHEYENNE, 'lat': 95}), 'destination')
        self.assert_field_error(self.plan(destination=DENVER), 'destination')

    def test_invalid_departure(self):
        self.assert_field_error(self.plan(departure_time='2026-10-12T06:20:00'), 'departure_time')
        self.assert_field_error(self.plan(departure_time='not a date'), 'departure_time')
        past = (DEPARTURE - timedelta(hours=3)).isoformat()
        self.assertIn('past', self.plan(departure_time=past).json()['field_errors']['departure_time'])
        far = (DEPARTURE + timedelta(days=8)).isoformat()
        self.assertIn('7 days', self.plan(departure_time=far).json()['field_errors']['departure_time'])

    def test_invalid_weight_and_interval(self):
        self.assert_field_error(self.plan(load_weight_kg=0), 'load_weight_kg')
        self.assert_field_error(self.plan(load_weight_kg=-5), 'load_weight_kg')
        self.assert_field_error(self.plan(load_weight_kg=60000), 'load_weight_kg')
        self.assert_field_error(self.plan(checkpoint_interval_miles=30), 'checkpoint_interval_miles')

    # --- failures ---

    def test_no_route_found(self):
        self.here_answer = httpx.Response(
            200, json={'notices': [{'title': "Couldn't find a route.", 'code': 'noRouteFound'}], 'routes': []}
        )

        response = self.plan()

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['detail'], 'No truck route was found between these places.')
        self.assertFalse(response.json()['retryable'])

    @override_settings(HERE_API_KEY='')
    def test_missing_key(self):
        response = self.plan()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'detail': 'Route planning is not configured.', 'retryable': False})

    def test_here_down_is_retryable(self):
        self.here_answer = httpx.Response(503)

        with self.assertLogs('here.client', level='WARNING'):
            response = self.plan()

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {'detail': 'Route planning is unavailable.', 'retryable': True})
        self.assertEqual(len(self.here_requests), 3)

    def test_here_timeout_is_retryable(self):
        self.here_answer = httpx.ReadTimeout('timed out')

        with self.assertLogs('here.client', level='WARNING'):
            response = self.plan()

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json(), {'detail': 'Route planning took too long.', 'retryable': True})

    def test_here_rejecting_the_request_is_not_retryable_and_leaks_no_key(self):
        self.here_answer = httpx.Response(400, json={'title': 'Malformed request', 'cause': 'bad vehicle'})

        with self.assertLogs('here.client', level='ERROR') as logs:
            response = self.plan()

        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.json()['retryable'])
        self.assertIn('Malformed request', logs.output[0])
        self.assertNotIn(FAKE_KEY, logs.output[0] + response.content.decode())
