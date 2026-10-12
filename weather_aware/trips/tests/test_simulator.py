from datetime import timedelta
from unittest import mock

import httpx
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from tenacity import wait_none

from here.client import HereClient
from trips.open_meteo import OpenMeteoClient
from trips.simulated_weather import SCENARIOS

from .test_endpoint import DEPARTURE, FAKE_KEY, HERE_ROUTE, URL, body

SCENARIOS_URL = '/api/trips/weather-scenarios/'
KG_PER_LB = 0.45359237


@override_settings(HERE_API_KEY=FAKE_KEY, ALLOW_WEATHER_SIMULATION=True)
class WeatherSimulatorTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.here_requests = []
        self.weather_requests = []

        def here(request):
            self.here_requests.append(request)
            return httpx.Response(200, json=HERE_ROUTE)

        def open_meteo(request):
            self.weather_requests.append(request)
            return httpx.Response(500)

        patches = [
            mock.patch.object(HereClient, 'transport', httpx.MockTransport(here)),
            mock.patch.object(HereClient, 'wait', wait_none()),
            mock.patch.object(OpenMeteoClient, 'transport', httpx.MockTransport(open_meteo)),
            mock.patch('django.utils.timezone.now', return_value=DEPARTURE - timedelta(hours=1)),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def plan(self, scenario, cargo_lb=20_000):
        cache.clear()
        response = self.client.post(
            URL, body(weather_scenario=scenario, load_weight_kg=round(cargo_lb * KG_PER_LB, 2)), format='json'
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def levels(self, plan):
        return {checkpoint['risk_level'] for checkpoint in plan['routes'][0]['checkpoints']}

    def test_simulated_plan_says_so_first_and_skips_open_meteo(self):
        plan = self.plan('wind_38')

        self.assertEqual(plan['warnings'][0]['code'], 'simulated_weather')
        self.assertIn('Wind 38 mph everywhere', plan['warnings'][0]['message'])
        self.assertIn('Not a real forecast', plan['warnings'][0]['message'])
        self.assertEqual(self.weather_requests, [])
        self.assertEqual(len(self.here_requests), 1)

    def test_real_forecast_has_no_simulation_warning(self):
        with self.assertLogs('trips.open_meteo', level='WARNING'):
            plan = self.client.post(URL, body(), format='json').json()

        self.assertNotIn('simulated_weather', [w['code'] for w in plan['warnings']])
        self.assertGreater(len(self.weather_requests), 0)

    def test_calm_is_low_everywhere(self):
        self.assertEqual(self.levels(self.plan('calm')), {'low'})

    def test_wind_38_turns_on_40000_lb(self):
        at_limit = self.plan('wind_38', cargo_lb=40_000)
        over = self.plan('wind_38', cargo_lb=42_000)

        self.assertEqual(self.levels(at_limit), {'high'})
        self.assertEqual(self.levels(over), {'severe'})
        self.assertIn('40,000 lb', over['routes'][0]['checkpoints'][0]['load_rule'])

    def test_wind_48_turns_on_30000_lb(self):
        at_limit = self.plan('wind_48', cargo_lb=30_000)
        over = self.plan('wind_48', cargo_lb=30_001)

        self.assertEqual(self.levels(at_limit), {'severe'})
        self.assertEqual(self.levels(over), {'no_travel'})
        self.assertIn('no_travel_all_routes', [w['code'] for w in over['warnings']])

    def test_wind_band_puts_no_travel_on_part_of_the_route_only(self):
        plan = self.plan('wind_band')
        route = plan['routes'][0]

        self.assertGreater(route['miles_by_level']['no_travel'], 0)
        # The 38 mph ring around the core is High at this cargo weight.
        self.assertGreater(route['miles_by_level']['high'], 0)
        self.assertLess(route['miles_by_level']['no_travel'], route['distance_miles'] / 2)
        self.assertEqual(route['worst_segment']['risk_level'], 'no_travel')
        self.assertEqual(route['worst_segment']['description'], 'Wind gusts 60 mph')

    def test_blizzard_makes_the_end_of_the_route_no_travel_by_snow(self):
        plan = self.plan('blizzard_destination')
        checkpoints = plan['routes'][0]['checkpoints']

        self.assertEqual(checkpoints[-1]['risk_level'], 'no_travel')
        self.assertEqual(checkpoints[-1]['levels'], {'wind': 'low', 'rain': 'low', 'snow': 'no_travel'})
        self.assertEqual(checkpoints[-1]['deciding_condition'], 'Snow 3.5 in/hr')
        self.assertIn('no_travel_all_routes', [w['code'] for w in plan['warnings']])
        self.assertIn('later departure', plan['recommendation_reason'])

    def test_heavy_rain_is_decided_by_rain(self):
        checkpoints = self.plan('heavy_rain')['routes'][0]['checkpoints']

        wet = [c for c in checkpoints if c['risk_level'] == 'severe']
        self.assertTrue(wet)
        self.assertEqual(wet[0]['levels']['rain'], 'severe')
        self.assertEqual(wet[0]['deciding_condition'], 'Rain 0.60 in/hr')
        self.assertEqual(checkpoints[-1]['risk_level'], 'low')

    def test_moving_storm_changes_the_heatmap_over_time(self):
        heatmap = self.plan('moving_storm')['heatmap']

        first = [row[0] for row in heatmap['levels']]
        last = [row[48] for row in heatmap['levels']]
        self.assertNotEqual(first, last)
        self.assertEqual(max(first), 3)
        self.assertEqual(max(last), 3)

    def test_no_forecast_leaves_everything_unknown_and_recommends_nothing(self):
        plan = self.plan('no_forecast')

        self.assertEqual(self.levels(plan), {None})
        self.assertIsNone(plan['recommended_route_id'])
        self.assertIn('missing_weather', [w['code'] for w in plan['warnings']])

    def test_unknown_scenario_is_rejected(self):
        response = self.client.post(URL, body(weather_scenario='hurricane'), format='json')

        self.assertEqual(response.status_code, 422)
        self.assertEqual(list(response.json()['field_errors']), ['weather_scenario'])

    def test_scenario_list(self):
        response = self.client.get(SCENARIOS_URL)

        self.assertEqual(response.json(), {'scenarios': SCENARIOS})
        self.assertEqual(len(SCENARIOS), 8)

    @override_settings(ALLOW_WEATHER_SIMULATION=False)
    def test_simulation_is_refused_and_hidden_when_not_allowed(self):
        response = self.client.post(URL, body(weather_scenario='wind_48'), format='json')

        self.assertEqual(response.status_code, 422)
        self.assertIn('development', response.json()['field_errors']['weather_scenario'])
        self.assertEqual(self.here_requests, [])
        self.assertEqual(self.client.get(SCENARIOS_URL).json(), {'scenarios': []})
