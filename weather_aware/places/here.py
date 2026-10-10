"""Client for the HERE Geocoding & Search API.

The only module that knows HERE's URLs, parameters and response format.
"""

import logging

import httpx
from rest_framework import status
from rest_framework.exceptions import APIException
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

AUTOSUGGEST_URL = 'https://autosuggest.search.hereapi.com/v1/autosuggest'
# Autosuggest needs a search centre. The middle of the USA favours no region.
USA_CENTRE = '39.8283,-98.5795'
MAX_SUGGESTIONS = 8
# Street addresses, cities and postal codes; no businesses or category
# suggestions. Filtered here because the live Autosuggest endpoint rejects
# every value of its `resultTypes` parameter that we tried.
ADDRESS_RESULT_TYPES = frozenset(
    {'houseNumber', 'street', 'intersection', 'addressBlock', 'locality', 'postalCodePoint'}
)
# Ask for more than we return, since non-address results are dropped.
HERE_LIMIT = 20


class HereError(APIException):
    """Base for failures talking to HERE. DRF renders these as {"detail": ...}."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = 'Place search is unavailable.'


class HereNotConfigured(HereError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Place search is not configured.'


class HereBusy(HereError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Place search is busy. Try again shortly.'


class HereTimeout(HereError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = 'Place search took too long.'


class _ServerError(Exception):
    """HERE answered 5xx. Worth another try."""


class HereClient:
    timeout = 5.0
    attempts = 3
    wait = wait_exponential(multiplier=0.2, max=1)
    # Tests swap in an httpx.MockTransport.
    transport = None

    def __init__(self, api_key):
        self.api_key = api_key

    def autosuggest(self, text):
        """Return place suggestions for partial text, in the frontend's shape."""
        if not self.api_key:
            raise HereNotConfigured()

        params = {
            'q': text,
            'in': 'countryCode:USA',
            'at': USA_CENTRE,
            'show': 'tz',
            'limit': HERE_LIMIT,
            'termsLimit': 0,
            'lang': 'en-US',
            'apiKey': self.api_key,
        }
        payload = self._get(AUTOSUGGEST_URL, params)
        suggestions = []
        for item in payload.get('items', []):
            suggestion = _to_suggestion(item)
            if suggestion:
                suggestions.append(suggestion)
        return suggestions[:MAX_SUGGESTIONS]

    def _get(self, url, params):
        retrying = Retrying(
            stop=stop_after_attempt(self.attempts),
            wait=self.wait,
            retry=retry_if_exception_type((httpx.TransportError, _ServerError)),
            reraise=True,
        )
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                return retrying(self._get_once, client, url, params)
        except httpx.TimeoutException:
            logger.warning('HERE timed out after %s attempts', self.attempts)
            raise HereTimeout()
        except (httpx.TransportError, _ServerError) as error:
            # Never log the request URL: it carries the API key.
            logger.warning('HERE unavailable after %s attempts: %s', self.attempts, type(error).__name__)
            raise HereError()

    def _get_once(self, client, url, params):
        response = client.get(url, params=params)
        if response.status_code >= 500:
            raise _ServerError()
        if response.status_code == 429:
            logger.warning('HERE rate limit reached')
            raise HereBusy()
        if response.status_code >= 400:
            logger.error(
                'HERE rejected the request with status %s: %s',
                response.status_code,
                _describe_rejection(response),
            )
            raise HereError()
        return response.json()


def _describe_rejection(response):
    """HERE's own explanation of a 4xx. These fields never contain the API key."""
    try:
        body = response.json()
    except ValueError:
        return 'no details'
    if not isinstance(body, dict):
        return 'no details'
    parts = [str(body[field]) for field in ('title', 'cause', 'action') if body.get(field)]
    return ' | '.join(parts) or 'no details'


def _to_suggestion(item):
    """Map one HERE item to a suggestion, or None if it lacks what the map needs."""
    if item.get('resultType') not in ADDRESS_RESULT_TYPES:
        return None
    position = item.get('position') or {}
    timezone = (item.get('timeZone') or {}).get('name')
    label = (item.get('address') or {}).get('label') or item.get('title')
    if 'lat' not in position or 'lng' not in position or not timezone or not label:
        return None
    return {
        'id': item.get('id') or label,
        'label': label,
        'lat': position['lat'],
        'lon': position['lng'],
        'timezone': timezone,
    }
