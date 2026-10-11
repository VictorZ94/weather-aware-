from unittest import mock

import httpx
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from tenacity import wait_none

from here.client import HereClient

URL = '/api/places/suggest/'
FAKE_KEY = 'test-here-key'

DENVER = {
    'title': 'Denver, CO, United States',
    'id': 'here:cm:namedplace:21017258',
    'resultType': 'locality',
    'address': {'label': 'Denver, CO, United States'},
    'position': {'lat': 39.73919, 'lng': -104.98487},
    'timeZone': {'name': 'America/Denver', 'utcOffset': '-06:00'},
}
NO_POSITION = {
    'title': 'Denver Ave',
    'id': 'x1',
    'resultType': 'street',
    'timeZone': {'name': 'America/Denver'},
}
NO_TIMEZONE = {
    'title': 'Denton, TX',
    'id': 'x2',
    'resultType': 'locality',
    'position': {'lat': 33.2, 'lng': -97.1},
}
BUSINESS = {
    'title': 'Denver Zoo',
    'id': 'x3',
    'resultType': 'place',
    'address': {'label': 'Denver Zoo, 2300 Steele St, Denver, CO 80205, United States'},
    'position': {'lat': 39.7496, 'lng': -104.95085},
    'timeZone': {'name': 'America/Denver'},
}
CHAIN = {'title': "Denny's", 'id': 'x4', 'resultType': 'chainQuery'}


@override_settings(HERE_API_KEY=FAKE_KEY)
class SuggestPlacesTests(APITestCase):
    def setUp(self):
        # Also resets the throttle counters, which live in the cache.
        cache.clear()
        self.requests = []
        self.responses = []

        def handler(request):
            self.requests.append(request)
            answer = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
            if isinstance(answer, Exception):
                raise answer
            return answer

        patches = [
            mock.patch.object(HereClient, 'transport', httpx.MockTransport(handler)),
            mock.patch.object(HereClient, 'wait', wait_none()),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def here_returns(self, *answers):
        """Queue HERE's answers in order; the last one repeats."""
        self.responses = list(answers)

    def test_maps_here_items_to_the_frontend_contract(self):
        self.here_returns(httpx.Response(200, json={'items': [DENVER], 'queryTerms': []}))

        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                'suggestions': [
                    {
                        'id': 'here:cm:namedplace:21017258',
                        'label': 'Denver, CO, United States',
                        'lat': 39.73919,
                        'lon': -104.98487,
                        'timezone': 'America/Denver',
                    }
                ]
            },
        )

    def test_asks_here_for_us_addresses_with_time_zones(self):
        self.here_returns(httpx.Response(200, json={'items': []}))

        self.client.get(URL, {'q': 'den'})

        params = self.requests[0].url.params
        self.assertEqual(self.requests[0].url.host, 'autosuggest.search.hereapi.com')
        self.assertEqual(params['q'], 'den')
        self.assertEqual(params['in'], 'countryCode:USA')
        # The live endpoint rejects resultTypes, so it must not be sent.
        self.assertNotIn('resultTypes', params)
        self.assertEqual(params['show'], 'tz')
        self.assertEqual(params['apiKey'], FAKE_KEY)

    def test_drops_items_without_position_or_time_zone(self):
        self.here_returns(httpx.Response(200, json={'items': [NO_POSITION, DENVER, NO_TIMEZONE]}))

        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual([place['label'] for place in response.json()['suggestions']], [DENVER['title']])

    def test_keeps_addresses_and_cities_only(self):
        self.here_returns(httpx.Response(200, json={'items': [BUSINESS, CHAIN, DENVER]}))

        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual([place['label'] for place in response.json()['suggestions']], [DENVER['title']])

    def test_returns_at_most_eight_suggestions(self):
        many = [{**DENVER, 'id': f'id-{n}'} for n in range(15)]
        self.here_returns(httpx.Response(200, json={'items': many}))

        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(len(response.json()['suggestions']), 8)

    def test_short_or_missing_text_returns_nothing_without_calling_here(self):
        for params in ({}, {'q': ''}, {'q': 'd'}, {'q': '   '}):
            response = self.client.get(URL, params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {'suggestions': []})
        self.assertEqual(self.requests, [])

    def test_text_that_is_too_long_is_rejected(self):
        response = self.client.get(URL, {'q': 'x' * 101})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'], 'Search text is too long.')
        self.assertEqual(self.requests, [])

    def test_repeated_text_is_served_from_cache(self):
        self.here_returns(httpx.Response(200, json={'items': [DENVER]}))

        first = self.client.get(URL, {'q': 'den'})
        second = self.client.get(URL, {'q': ' DEN '})

        self.assertEqual(first.json(), second.json())
        self.assertEqual(len(self.requests), 1)

    @override_settings(HERE_API_KEY='')
    def test_missing_key_is_reported_as_not_configured(self):
        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['detail'], 'Place search is not configured.')
        self.assertEqual(self.requests, [])

    def test_rejected_key_is_not_retried_and_not_leaked(self):
        self.here_returns(httpx.Response(401, json={'error': 'Unauthorized', 'apiKey': FAKE_KEY}))

        with self.assertLogs('here.client', level='ERROR') as logs:
            response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['detail'], 'Place search is unavailable.')
        self.assertEqual(len(self.requests), 1)
        self.assertNotIn(FAKE_KEY, response.content.decode())
        self.assertNotIn(FAKE_KEY, ' '.join(logs.output))

    def test_here_explanation_of_a_bad_request_is_logged(self):
        self.here_returns(
            httpx.Response(
                400,
                json={
                    'status': 400,
                    'title': "Illegal input for parameter 'resultTypes'",
                    'cause': "Actual parameter value: 'address'",
                    'action': "Unsupported value: 'address'",
                },
            )
        )

        with self.assertLogs('here.client', level='ERROR') as logs:
            response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['detail'], 'Place search is unavailable.')
        self.assertEqual(len(self.requests), 1)
        self.assertIn("Illegal input for parameter 'resultTypes'", logs.output[0])
        self.assertIn("Unsupported value: 'address'", logs.output[0])
        self.assertNotIn(FAKE_KEY, logs.output[0])

    def test_here_rate_limit_is_reported_as_busy(self):
        self.here_returns(httpx.Response(429))

        with self.assertLogs('here.client', level='WARNING'):
            response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['detail'], 'Place search is busy. Try again shortly.')
        self.assertEqual(len(self.requests), 1)

    def test_timeout_is_tried_three_times_then_reported(self):
        self.here_returns(httpx.ReadTimeout('timed out'))

        with self.assertLogs('here.client', level='WARNING') as logs:
            response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json()['detail'], 'Place search took too long.')
        self.assertEqual(len(self.requests), 3)
        self.assertNotIn(FAKE_KEY, ' '.join(logs.output))

    def test_server_error_is_tried_three_times_then_reported(self):
        self.here_returns(httpx.Response(503))

        with self.assertLogs('here.client', level='WARNING'):
            response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(len(self.requests), 3)

    def test_one_failure_then_success_returns_suggestions(self):
        self.here_returns(httpx.Response(500), httpx.Response(200, json={'items': [DENVER]}))

        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['suggestions']), 1)
        self.assertEqual(len(self.requests), 2)

    def test_failures_are_not_cached(self):
        self.here_returns(httpx.Response(429), httpx.Response(200, json={'items': [DENVER]}))

        with self.assertLogs('here.client', level='WARNING'):
            self.client.get(URL, {'q': 'den'})
        response = self.client.get(URL, {'q': 'den'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['suggestions']), 1)

    @override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:5173'])
    def test_vite_dev_origin_is_allowed_by_cors(self):
        response = self.client.get(URL, {'q': 'd'}, headers={'Origin': 'http://localhost:5173'})

        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:5173')
