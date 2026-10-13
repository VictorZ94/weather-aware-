"""Step 3: turn weather into risk levels, per checkpoint and per route."""

from django.conf import settings

from . import rules


def classify(weather, cargo_lb):
    """Risk for one place and time.

    `weather` has wind_gust_mph, wind_speed_mph, rain_in and snow_in.
    Returns the level of each condition, the final level (the worst of them),
    the condition that decided it, and the load rule applied, if any.
    """
    if settings.RISK_WIND_SOURCE == 'sustained':
        wind, wind_label = weather['wind_speed_mph'], 'Wind'
    else:
        wind, wind_label = weather['wind_gust_mph'], 'Wind gusts'

    wind_level, load_rule = rules.apply_load_rules(wind, cargo_lb)
    levels = {
        'wind': wind_level,
        'rain': rules.rain_level(weather['rain_in']),
        'snow': rules.snow_level(weather['snow_in']),
    }
    level = max(levels.values())

    descriptions = {
        'wind': f'{wind_label} {round(wind)} mph',
        'rain': f"Rain {weather['rain_in']:.2f} in/hr",
        'snow': f"Snow {weather['snow_in']:.1f} in/hr",
    }
    if level == rules.LOW:
        deciding = 'No significant weather'
    else:
        deciding = next(descriptions[name] for name in ('wind', 'snow', 'rain') if levels[name] == level)

    return {
        'levels': levels,
        'level': level,
        'deciding_condition': deciding,
        'load_rule': load_rule,
    }


def level_at(weather, cargo_lb):
    """Just the final level; used for the heatmap."""
    return classify(weather, cargo_lb)['level']


def route_totals(checkpoints):
    """Miles at each level, mile-weighted average risk, and the worst stretch.

    Each checkpoint carries `level` (0-4 or None when the forecast is missing)
    and the miles it stands for.
    """
    miles_by_level = {name: 0.0 for name in rules.LEVELS}
    miles_by_level['unknown'] = 0.0
    weighted = 0.0
    known = 0.0
    for checkpoint in checkpoints:
        miles = checkpoint['miles_represented']
        if checkpoint['level'] is None:
            miles_by_level['unknown'] += miles
        else:
            miles_by_level[rules.LEVELS[checkpoint['level']]] += miles
            weighted += checkpoint['level'] * miles
            known += miles

    return {
        'miles_by_level': miles_by_level,
        'average_risk': weighted / known if known > 0 else None,
        'worst_segment': _worst_segment(checkpoints),
    }


def _worst_segment(checkpoints):
    """The longest unbroken stretch at the route's worst level, or None if all Low."""
    known = [checkpoint['level'] for checkpoint in checkpoints if checkpoint['level'] is not None]
    if not known or max(known) == rules.LOW:
        return None
    worst = max(known)

    best = None
    run = None
    for checkpoint in checkpoints:
        if checkpoint['level'] == worst:
            if run is None:
                run = {'from': checkpoint['covers_from_mile'], 'first': checkpoint}
            run['to'] = checkpoint['covers_to_mile']
            if best is None or run['to'] - run['from'] > best['to'] - best['from']:
                best = dict(run)
        else:
            run = None

    return {
        'from_mile': best['from'],
        'to_mile': best['to'],
        'risk_level': rules.LEVELS[worst],
        'description': best['first']['deciding_condition'],
    }
