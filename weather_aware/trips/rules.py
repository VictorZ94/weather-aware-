"""The risk and load rules. The only place they are written down.

Pure functions, no I/O. Units: wind in mph, rain and snow in inches per hour,
cargo in pounds. A value on a shared boundary goes to the higher level.
"""

LEVELS = ('low', 'moderate', 'high', 'severe', 'no_travel')
LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = range(5)


def wind_level(mph):
    if mph < 25:
        return LOW
    if mph < 35:
        return MODERATE
    if mph < 45:
        return HIGH
    if mph < 55:
        return SEVERE
    return NO_TRAVEL


def rain_level(inches_per_hour):
    if inches_per_hour < 0.10:
        return LOW
    if inches_per_hour < 0.25:
        return MODERATE
    if inches_per_hour < 0.50:
        return HIGH
    if inches_per_hour <= 1.00:
        return SEVERE
    return NO_TRAVEL


def snow_level(inches_per_hour):
    if inches_per_hour < 0.5:
        return LOW
    if inches_per_hour < 1.0:
        return MODERATE
    if inches_per_hour < 2.0:
        return HIGH
    if inches_per_hour <= 3.0:
        return SEVERE
    return NO_TRAVEL


def apply_load_rules(wind_mph, cargo_lb):
    """Wind level after the load rules, and the text of the rule that applied (or None).

    The load rules change the wind level only.
    """
    if wind_mph >= 55:
        return NO_TRAVEL, 'Wind 55 mph or more: No Travel for any load'
    if wind_mph >= 45 and cargo_lb > 30_000:
        return NO_TRAVEL, 'Wind 45–54 mph with cargo over 30,000 lb: No Travel'
    if 35 <= wind_mph < 45 and cargo_lb > 40_000:
        return SEVERE, 'Wind 35–44 mph with cargo over 40,000 lb: Severe'
    return wind_level(wind_mph), None
