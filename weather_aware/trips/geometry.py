"""Distances along a route line. Points are (lat, lon) unless a name says otherwise."""

import math
from bisect import bisect_left

EARTH_RADIUS_MILES = 3958.7613
METRES_PER_MILE = 1609.344


def haversine_miles(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def cumulative_miles(points):
    """Mile from the start for every point of the line."""
    miles = [0.0]
    for previous, point in zip(points, points[1:]):
        miles.append(miles[-1] + haversine_miles(previous, point))
    return miles


def interpolate(xs, ys, x):
    """Linear interpolation of y at x, for increasing xs. Clamps outside the range."""
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    i = bisect_left(xs, x)
    span = xs[i] - xs[i - 1]
    t = (x - xs[i - 1]) / span if span > 0 else 0.0
    return ys[i - 1] + (ys[i] - ys[i - 1]) * t


def point_at_mile(points, miles, mile):
    """The (lat, lon) on the line at a given mile from the start."""
    if mile <= miles[0]:
        return points[0]
    if mile >= miles[-1]:
        return points[-1]
    i = bisect_left(miles, mile)
    span = miles[i] - miles[i - 1]
    t = (mile - miles[i - 1]) / span if span > 0 else 0.0
    (lat1, lon1), (lat2, lon2) = points[i - 1], points[i]
    return (lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t)


def thin(points, miles, min_gap_miles=0.1):
    """Drop points closer than `min_gap_miles` to the last kept one.

    Keeps the first and last points. Used only for the line sent to the map.
    """
    kept = [points[0]]
    last_mile = miles[0]
    for point, mile in zip(points[1:-1], miles[1:-1]):
        if mile - last_mile >= min_gap_miles:
            kept.append(point)
            last_mile = mile
    if len(points) > 1:
        kept.append(points[-1])
    return kept
