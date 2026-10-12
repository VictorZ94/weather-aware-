"""Step 5: risk level for every corridor grid cell and every hour 0-48."""

from datetime import timedelta

from .forecast import grid_cell
from .risk import level_at

HOURS = 49  # hour 0 (departure) to hour 48
SAMPLE_EVERY_MILES = 2.0
UNKNOWN = -1


def corridor_cells(profiles):
    """The unique grid cells the routes pass through.

    Sampled every couple of miles, because consecutive points of a route line
    can be further apart than one cell on straight highway.
    """
    cells = set()
    for profile in profiles:
        mile = 0.0
        while mile < profile.total_miles:
            cells.add(grid_cell(*profile.point_at(mile)))
            mile += SAMPLE_EVERY_MILES
        cells.add(grid_cell(*profile.point_at(profile.total_miles)))
    return cells


def start_hour(departure_utc):
    """Hour 0 of the slider: the departure time rounded down to the hour."""
    return departure_utc.replace(minute=0, second=0, microsecond=0)


def build_heatmap(cells, forecasts, hour0, cargo_lb):
    """{hour0, points: [[lon, lat]], levels: [[level per hour] per point]}.

    Levels are 0-4 using the same rules and cargo weight as the checkpoints,
    or -1 where there is no forecast.
    """
    points = []
    levels = []
    for cell in sorted(cells):
        forecast = forecasts.get(cell)
        row = []
        for hour in range(HOURS):
            weather = forecast.at_hour(hour0 + timedelta(hours=hour)) if forecast else None
            row.append(level_at(weather, cargo_lb) if weather else UNKNOWN)
        points.append([cell[1], cell[0]])
        levels.append(row)
    return {'points': points, 'levels': levels}
