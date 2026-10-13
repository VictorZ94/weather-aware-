"""Runs the five steps in order and assembles the plan-trip response."""

from datetime import timedelta, timezone

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException

from here.routing import RoutingClient

from . import rules
from .forecast import grid_cell
from .geometry import METRES_PER_MILE, thin
from .heatmap import build_heatmap, corridor_cells, start_hour
from .nws import NwsClient
from .ranking import rank_routes
from .risk import classify, route_totals
from .sampling import build_profile, place_checkpoints, to_utc_iso
from .simulated_weather import SCENARIO_LABELS, simulated_forecasts

LB_PER_KG = 2.20462262
FORECAST_HOURS = 48
MAX_NAME_HIGHWAYS = 3
MIN_NAME_SHARE = 0.10


class NoRouteFound(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = 'No truck route was found between these places.'
    retryable = False


def plan_trip(request):
    """Build the full response for a validated plan-trip request."""
    origin = request['origin']
    destination = request['destination']
    departure = request['departure_time']
    cargo_kg = request['load_weight_kg']
    cargo_lb = round(cargo_kg * LB_PER_KG)
    interval = request['checkpoint_interval_miles']
    scenario = request.get('weather_scenario')

    here_routes = RoutingClient(settings.HERE_API_KEY).truck_routes(
        (origin['lat'], origin['lon']), (destination['lat'], destination['lon']), departure, cargo_kg
    )
    if not here_routes:
        raise NoRouteFound()

    profiles = [build_profile(route) for route in here_routes]
    departure_utc = departure.astimezone(timezone.utc)
    checkpoints_by_route = [place_checkpoints(profile, departure, interval) for profile in profiles]

    hour0 = start_hour(departure_utc)
    last_arrival = departure_utc + timedelta(seconds=max(route.duration_s for route in here_routes))
    cells = corridor_cells(profiles)
    for checkpoints in checkpoints_by_route:
        cells.update(grid_cell(checkpoint['lat'], checkpoint['lon']) for checkpoint in checkpoints)
    forecast_end = max(hour0 + timedelta(hours=FORECAST_HOURS), last_arrival) + timedelta(hours=1)
    if scenario:
        forecasts = simulated_forecasts(
            scenario, cells, hour0, forecast_end, profiles, (destination['lat'], destination['lon'])
        )
    else:
        forecasts = NwsClient().forecasts(cells, hour0, forecast_end)

    routes = []
    notices = []
    missing_checkpoints = 0
    for index, (here_route, profile, checkpoints) in enumerate(zip(here_routes, profiles, checkpoints_by_route)):
        route_id = f'route-{index + 1}'
        for checkpoint in checkpoints:
            _add_risk(checkpoint, forecasts, cargo_lb)
            if checkpoint['level'] is None:
                missing_checkpoints += 1
        totals = route_totals(checkpoints)

        line = thin(profile.points, profile.miles)
        routes.append(
            {
                'id': route_id,
                'name': None, 
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [[round(lon, 5), round(lat, 5)] for lat, lon in line],
                },
                'distance_miles': round(here_route.length_m / METRES_PER_MILE, 1),
                'duration_minutes': round(here_route.duration_s / 60),
                'arrival_time': to_utc_iso(departure_utc + timedelta(seconds=here_route.duration_s)),
                'rank': None, 
                'average_risk': None if totals['average_risk'] is None else round(totals['average_risk'], 2),
                'miles_by_level': {level: round(miles, 1) for level, miles in totals['miles_by_level'].items()},
                'worst_segment': _round_segment(totals['worst_segment']),
                'checkpoints': [_checkpoint_json(route_id, checkpoint) for checkpoint in checkpoints],
                '_highways': here_route.highway_metres,
            }
        )
        notices.extend(here_route.notices)

    _name_routes(routes)

    recommended_id, reason, all_no_travel = rank_routes(routes)

    heatmap = build_heatmap(cells, forecasts, hour0, cargo_lb)

    warnings = []
    if scenario:
        warnings.append(
            {
                'code': 'simulated_weather',
                'message': f'Simulated weather: {SCENARIO_LABELS[scenario]}. Not a real forecast.',
            }
        )
    if all_no_travel:
        warnings.append(
            {
                'code': 'no_travel_all_routes',
                'message': 'Every route crosses conditions rated No Travel. Consider a later departure.',
            }
        )
    if len(routes) < 3:
        only = 'route was' if len(routes) == 1 else 'routes were'
        warnings.append({'code': 'fewer_routes', 'message': f'Only {len(routes)} truck {only} found for this trip.'})
    if missing_checkpoints:
        total = sum(len(route['checkpoints']) for route in routes)
        if missing_checkpoints == total:
            message = 'Weather forecasts are unavailable right now. Risk is unknown on all routes.'
        else:
            message = f'No forecast was available for {missing_checkpoints} checkpoints. Risk there is unknown.'
        warnings.append({'code': 'missing_weather', 'message': message})
    for notice in dict.fromkeys(notices):
        warnings.append({'code': 'route_notice', 'message': notice})

    return {
        'origin': origin,
        'destination': destination,
        'departure_time': to_utc_iso(departure),
        'checkpoint_interval_miles': interval,
        'recommended_route_id': recommended_id,
        'recommendation_reason': reason,
        'warnings': warnings,
        'routes': routes,
        'heatmap': {'hour0': to_utc_iso(hour0), **heatmap},
    }


def _add_risk(checkpoint, forecasts, cargo_lb):
    """Attach weather at the checkpoint's ETA and the risk it implies."""
    forecast = forecasts.get(grid_cell(checkpoint['lat'], checkpoint['lon']))
    weather = forecast.around(checkpoint['eta']) if forecast else None
    checkpoint['weather'] = weather
    if weather is None:
        checkpoint.update(level=None, levels=None, deciding_condition=None, load_rule=None)
    else:
        checkpoint.update(classify(weather, cargo_lb))


def _checkpoint_json(route_id, checkpoint):
    level = checkpoint['level']
    weather = checkpoint['weather']
    return {
        'id': f"{route_id}-cp-{checkpoint['seq']}",
        'seq': checkpoint['seq'],
        'mile': round(checkpoint['mile'], 1),
        'lat': round(checkpoint['lat'], 5),
        'lon': round(checkpoint['lon'], 5),
        'eta': to_utc_iso(checkpoint['eta']),
        'timezone': checkpoint['timezone'],
        'miles_represented': round(checkpoint['miles_represented'], 2),
        'risk_level': None if level is None else rules.LEVELS[level],
        'levels': None
        if level is None
        else {name: rules.LEVELS[value] for name, value in checkpoint['levels'].items()},
        'deciding_condition': checkpoint['deciding_condition'],
        'load_rule': checkpoint['load_rule'],
        'data_status': 'missing' if level is None else 'ok',
        'weather': None
        if weather is None
        else {
            'wind_gust_mph': round(weather['wind_gust_mph'], 1),
            'wind_speed_mph': round(weather['wind_speed_mph'], 1),
            'rain_in': round(weather['rain_in'], 3),
            'snow_in': round(weather['snow_in'], 3),
        },
    }


def _round_segment(segment):
    if segment is None:
        return None
    return {**segment, 'from_mile': round(segment['from_mile'], 1), 'to_mile': round(segment['to_mile'], 1)}


def _name_routes(routes):
    """Name each route after the highways carrying most of its miles, e.g. "via I-76, I-80"."""
    taken = set()
    for index, route in enumerate(routes):
        highways = route.pop('_highways')
        by_size = sorted(highways, key=highways.get, reverse=True)
        total = sum(highways.values())
        biggest = [h for h in by_size if highways[h] >= total * MIN_NAME_SHARE][:MAX_NAME_HIGHWAYS] or by_size[:1]
        name = 'via ' + ', '.join(h for h in highways if h in biggest) if biggest else ''
        if not name or name in taken:
            extra = next((h for h in by_size if h not in biggest), None)
            name = f'{name}, {extra}' if name and extra else f'Route {"ABC"[index % 3]}'
        if name in taken:
            name = f'Route {"ABC"[index % 3]}'
        taken.add(name)
        route['name'] = name
