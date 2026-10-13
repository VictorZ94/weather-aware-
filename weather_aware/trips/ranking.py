"""Step 4: order the routes and pick the recommended one.

Order of the rules: fewest Severe miles, fewest High miles, lowest average
risk, shortest travel time. Risk decides first; time breaks ties.
"""

MAX_UNKNOWN_SHARE = 0.20


def _round5(miles):
    """Severe and High miles are compared to the nearest 5 so tiny differences tie."""
    return 5 * round(miles / 5)


def _has_no_travel(route):
    return route['miles_by_level']['no_travel'] > 0


def _too_little_weather(route):
    distance = route['distance_miles']
    return distance > 0 and route['miles_by_level']['unknown'] / distance > MAX_UNKNOWN_SHARE


def _sort_key(route):
    miles = route['miles_by_level']
    average = route['average_risk']
    return (
        _has_no_travel(route) or _too_little_weather(route),
        _round5(miles['no_travel']),
        _round5(miles['severe']),
        _round5(miles['high']),
        round(average, 1) if average is not None else float('inf'),
        route['duration_minutes'],
    )


def rank_routes(routes):
    """Sort routes in place by rank, set `rank` on each, and return the recommendation.

    Returns (recommended_route_id, reason, all_routes_have_no_travel).
    A route with No Travel miles is never recommended unless every route has some.
    A route missing weather for over 20% of its miles is never recommended.
    """
    routes.sort(key=_sort_key)
    for rank, route in enumerate(routes, start=1):
        route['rank'] = rank
    if not routes:
        return None, None, False

    all_no_travel = all(_has_no_travel(route) for route in routes)
    eligible = [route for route in routes if not _has_no_travel(route) and not _too_little_weather(route)]
    best = routes[0]

    if eligible:
        return best['id'], _reason(best, eligible[1:], len(routes)), False
    if all_no_travel and not _too_little_weather(best):
        others = routes[1:]
        reason = 'Every route has No Travel conditions. Consider a later departure.'
        if others:
            reason = (
                f"Every route has No Travel conditions; this one has the fewest No Travel miles "
                f"({round(best['miles_by_level']['no_travel'])} vs "
                f"{round(others[0]['miles_by_level']['no_travel'])}). Consider a later departure."
            )
        return best['id'], reason, True
    return None, None, all_no_travel


def _reason(best, other_eligible, route_count):
    """Why the winner won: the first rule that separates it from the runner-up."""
    if route_count == 1:
        return 'The only truck route available.'
    if not other_eligible:
        return 'The only route without No Travel conditions or missing weather.'

    runner_up = other_eligible[0]
    mine, theirs = best['miles_by_level'], runner_up['miles_by_level']
    if _round5(mine['severe']) != _round5(theirs['severe']):
        return f"Fewest Severe miles ({_round5(mine['severe'])} vs {_round5(theirs['severe'])})"
    if _round5(mine['high']) != _round5(theirs['high']):
        return f"Fewest High miles ({_round5(mine['high'])} vs {_round5(theirs['high'])})"
    if round(best['average_risk'], 1) != round(runner_up['average_risk'], 1):
        return f"Lowest average risk ({best['average_risk']:.1f} vs {runner_up['average_risk']:.1f})"
    faster_by = round(runner_up['duration_minutes'] - best['duration_minutes'])
    if faster_by > 0:
        return f'All routes equally safe; fastest by {faster_by} min'
    return 'All routes equally safe and equally fast'
