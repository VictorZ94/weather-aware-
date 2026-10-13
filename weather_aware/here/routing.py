"""Truck routes from HERE Routing v8."""

import hashlib
import json
from dataclasses import dataclass, field

import flexpolyline
from django.conf import settings
from django.core.cache import cache

from .client import HereClient

ROUTES_URL = 'https://router.hereapi.com/v8/routes'
KG_PER_LB = 0.45359237
CM_PER_FT = 30.48
CACHE_SECONDS = 10 * 60


@dataclass
class Span:
    """A stretch of road with one speed: where it starts on the line, how long, how slow."""

    offset: int
    length_m: float
    duration_s: float


@dataclass
class TruckRoute:
    points: list 
    length_m: float
    duration_s: float
    spans: list
    highway_metres: dict = field(default_factory=dict)
    notices: list = field(default_factory=list)


class RoutingClient(HereClient):
    service = 'Route planning'
    timeout = 20.0

    def truck_routes(self, origin, destination, departure, cargo_kg):
        """Up to 3 truck routes between two (lat, lon) points, leaving at `departure`.

        Returns [] when HERE finds no route.
        """
        profile = settings.TRUCK_PROFILE
        gross_kg = round(cargo_kg + profile['empty_weight_lb'] * KG_PER_LB)
        params = {
            'transportMode': 'truck',
            'origin': f'{origin[0]},{origin[1]}',
            'destination': f'{destination[0]},{destination[1]}',
            'departureTime': departure.isoformat(timespec='seconds'),
            'alternatives': 2,
            'return': 'polyline,summary',
            'spans': 'length,duration,routeNumbers,dynamicSpeedInfo',
            'lang': 'en-US',
            'vehicle[grossWeight]': gross_kg,
            'vehicle[height]': round(profile['height_ft'] * CM_PER_FT),
            'vehicle[width]': round(profile['width_ft'] * CM_PER_FT),
            'vehicle[length]': round(profile['length_ft'] * CM_PER_FT),
            'vehicle[axleCount]': profile['axle_count'],
            'vehicle[type]': 'tractor',
            'vehicle[trailerCount]': 1,
        }

        cache_key = 'here:routes:' + hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
        payload = cache.get(cache_key)
        if payload is None:
            payload = self.get(ROUTES_URL, params)
            cache.set(cache_key, payload, CACHE_SECONDS)

        return [_to_route(route) for route in payload.get('routes', []) if route.get('sections')]


def _to_route(route):
    """Join a HERE route's sections into one line with one list of spans."""
    points = []
    spans = []
    highway_metres = {}
    notices = []
    length_m = 0.0
    duration_s = 0.0

    for section in route['sections']:
        section_points = [(lat, lon) for lat, lon, *_ in flexpolyline.decode(section['polyline'])]
        shift = len(points) - 1 if points else 0
        points.extend(section_points[1:] if points else section_points)

        for span in section.get('spans', []):
            spans.append(Span(span['offset'] + shift, span.get('length', 0), span.get('duration', 0)))
            numbers = span.get('routeNumbers') or []
            if numbers:
                name = numbers[0]['value']
                highway_metres[name] = highway_metres.get(name, 0) + span.get('length', 0)

        length_m += section['summary']['length']
        duration_s += section['summary']['duration']
        notices.extend(notice['title'] for notice in section.get('notices', []) if notice.get('title'))

    return TruckRoute(
        points=points,
        length_m=length_m,
        duration_s=duration_s,
        spans=spans,
        highway_metres=highway_metres,
        notices=notices,
    )
