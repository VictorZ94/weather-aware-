"""Place search with HERE Autosuggest (Geocoding & Search API v7)."""

from .client import HereClient

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


class AutosuggestClient(HereClient):
    """Client for HERE Autosuggest (Geocoding & Search API v7)."""
    
    service = 'Place search'

    def autosuggest(self, text):
        """Return place suggestions for partial text, in the frontend's shape."""
        payload = self.get(
            AUTOSUGGEST_URL,
            {
                'q': text,
                'in': 'countryCode:USA',
                'at': USA_CENTRE,
                'show': 'tz',
                'limit': HERE_LIMIT,
                'termsLimit': 0,
                'lang': 'en-US',
            },
        )
        suggestions = []
        for item in payload.get('items', []):
            suggestion = _to_suggestion(item)
            if suggestion:
                suggestions.append(suggestion)
        return suggestions[:MAX_SUGGESTIONS]


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
