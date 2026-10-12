"""Made-up weather for development, so extreme conditions can be seen on real routes.

Returns the same {cell: Forecast} as OpenMeteoClient.forecasts, so the rules,
ranking and heatmap run on it unchanged. Only reachable when
settings.ALLOW_WEATHER_SIMULATION is on. No risk rules in here: scenarios
only say what the weather is.
"""

from .geometry import haversine_miles
from .open_meteo import Forecast

SCENARIOS = [
    {'id': 'calm', 'label': 'Calm', 'description': 'Light wind and dry everywhere.'},
    {
        'id': 'wind_38',
        'label': 'Wind 38 mph everywhere',
        'description': 'High up to 40,000 lb of cargo, Severe above.',
    },
    {
        'id': 'wind_48',
        'label': 'Wind 48 mph everywhere',
        'description': 'Severe up to 30,000 lb of cargo, No Travel above.',
    },
    {
        'id': 'wind_band',
        'label': 'Wind band on the fastest route',
        'description': '60 mph gusts across part of the fastest route, 38 mph around it.',
    },
    {
        'id': 'blizzard_destination',
        'label': 'Blizzard at the destination',
        'description': 'Snow 3.5 in/hr around the destination, so every route ends in No Travel.',
    },
    {
        'id': 'heavy_rain',
        'label': 'Heavy rain early on the fastest route',
        'description': 'Rain 0.6 in/hr over the first third of the fastest route, 0.3 around it.',
    },
    {
        'id': 'moving_storm',
        'label': 'Storm moving through',
        'description': 'A snow and wind cell travelling from the destination to the origin over 48 hours.',
    },
    {'id': 'no_forecast', 'label': 'No forecast', 'description': 'No weather data at all.'},
]
SCENARIO_LABELS = {scenario['id']: scenario['label'] for scenario in SCENARIOS}

CALM = (8.0, 0.0, 0.0)  # gust mph, rain in/hr, snow in/hr
STORM_HOURS = 48


def simulated_forecasts(scenario, cells, start, end, profiles, destination):
    """Forecasts for `cells` covering start..end under a named scenario.

    `profiles` are the planned routes and `destination` is (lat, lon); scenarios
    are placed relative to them so they always affect the trip.
    """
    if scenario == 'no_forecast':
        return {}

    weather_at = _SCENARIO_BUILDERS[scenario](profiles, destination)
    hours = int((end - start).total_seconds() // 3600) + 1

    forecasts = {}
    for cell in cells:
        readings = [weather_at(cell, hour) for hour in range(hours)]
        gusts = [reading[0] for reading in readings]
        snow = [reading[2] for reading in readings]
        forecasts[cell] = Forecast(
            start=start,
            gust=gusts,
            wind=[round(gust * 0.6, 1) for gust in gusts],
            rain=[reading[1] for reading in readings],
            snow=snow,
            temperature=[-3.0 if amount > 0 else 12.0 for amount in snow],
        )
    return forecasts


def _fastest(profiles):
    return min(profiles, key=lambda profile: profile.seconds[-1])


def _stretch(profile, from_share, to_share, every_miles=3.0):
    """Points along part of a route, e.g. shares 0.4 to 0.6 for its middle fifth."""
    start = profile.total_miles * from_share
    end = profile.total_miles * to_share
    points = []
    mile = start
    while mile < end:
        points.append(profile.point_at(mile))
        mile += every_miles
    points.append(profile.point_at(end))
    return points


def _miles_to(cell, points):
    return min(haversine_miles(cell, point) for point in points)


def _everywhere(gust):
    return lambda profiles, destination: (lambda cell, hour: (gust, 0.0, 0.0))


def _wind_band(profiles, destination):
    """A band of No Travel wind across the fastest route, where the other routes are furthest away."""
    fastest = _fastest(profiles)
    others = [point for profile in profiles if profile is not fastest for point in _stretch(profile, 0, 1, 5.0)]

    centre_share, separation = 0.5, float('inf')
    if others:
        # Put the band where it is least likely to also cover another route.
        shares = [share / 100 for share in range(15, 90, 5)]
        centre_share = max(shares, key=lambda share: _miles_to(fastest.point_at(fastest.total_miles * share), others))
        separation = _miles_to(fastest.point_at(fastest.total_miles * centre_share), others)

    half_length = min(0.1, 30 / fastest.total_miles) if fastest.total_miles else 0.1
    band = _stretch(fastest, max(0, centre_share - half_length), min(1, centre_share + half_length))
    # Narrow enough to miss the other routes, and small next to a short route.
    core_miles = min(20.0, max(8.0, separation * 0.35), max(5.0, fastest.total_miles * 0.1))

    def weather_at(cell, hour):
        distance = _miles_to(cell, band)
        if distance <= core_miles:
            return (60.0, 0.0, 0.0)
        if distance <= core_miles * 2.5:
            return (38.0, 0.0, 0.0)
        return CALM

    return weather_at


def _blizzard_destination(profiles, destination):
    def weather_at(cell, hour):
        distance = haversine_miles(cell, destination)
        if distance <= 60:
            return (20.0, 0.0, 3.5)
        if distance <= 110:
            return (15.0, 0.0, 1.2)
        return CALM

    return weather_at


def _heavy_rain(profiles, destination):
    soaked = _stretch(_fastest(profiles), 0.10, 0.35)

    def weather_at(cell, hour):
        distance = _miles_to(cell, soaked)
        if distance <= 20:
            return (15.0, 0.6, 0.0)
        if distance <= 50:
            return (12.0, 0.3, 0.0)
        return CALM

    return weather_at


def _moving_storm(profiles, destination):
    """A cell that sits on the destination at hour 0 and reaches the origin at hour 48."""
    fastest = _fastest(profiles)
    centres = {}

    def weather_at(cell, hour):
        if hour not in centres:
            progress = min(1.0, hour / STORM_HOURS)
            centres[hour] = fastest.point_at(fastest.total_miles * (1 - progress))
        distance = haversine_miles(cell, centres[hour])
        if distance <= 40:
            return (40.0, 0.0, 2.5)
        if distance <= 90:
            return (30.0, 0.0, 0.7)
        return CALM

    return weather_at


_SCENARIO_BUILDERS = {
    'calm': _everywhere(CALM[0]),
    'wind_38': _everywhere(38.0),
    'wind_48': _everywhere(48.0),
    'wind_band': _wind_band,
    'blizzard_destination': _blizzard_destination,
    'heavy_rain': _heavy_rain,
    'moving_storm': _moving_storm,
}
