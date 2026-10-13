"""Step 2: checkpoints along a route and the truck's ETA at each."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from timezonefinder import TimezoneFinder

from .geometry import METRES_PER_MILE, cumulative_miles, interpolate, point_at_mile

_timezone_finder = None


def timezone_at(lat, lon):
    """IANA time zone name for a coordinate (offline lookup)."""
    global _timezone_finder
    if _timezone_finder is None:
        _timezone_finder = TimezoneFinder()
    return _timezone_finder.timezone_at(lat=lat, lng=lon) or 'UTC'


@dataclass
class RouteProfile:
    """For every point of a route line: its mile and the seconds elapsed from the start."""

    points: list
    miles: list
    seconds: list

    @property
    def total_miles(self):
        return self.miles[-1]

    def point_at(self, mile):
        return point_at_mile(self.points, self.miles, mile)

    def seconds_at(self, mile):
        return interpolate(self.miles, self.seconds, mile)


def build_profile(route):
    """Distance and time from the start for every point of a HERE route.

    Miles are scaled so the total equals HERE's own route length. Time comes
    from the spans: within one span the truck moves at that span's speed.
    """
    raw = cumulative_miles(route.points)
    total_miles = route.length_m / METRES_PER_MILE
    scale = total_miles / raw[-1] if raw[-1] > 0 else 1.0
    miles = [mile * scale for mile in raw]

    last = len(route.points) - 1
    seconds = [0.0] * len(route.points)
    elapsed = 0.0
    spans = sorted(route.spans, key=lambda span: span.offset)
    for i, span in enumerate(spans):
        start = min(span.offset, last)
        end = min(spans[i + 1].offset, last) if i + 1 < len(spans) else last
        span_miles = miles[end] - miles[start]
        for k in range(start, end + 1):
            share = (miles[k] - miles[start]) / span_miles if span_miles > 0 else 1.0
            seconds[k] = elapsed + span.duration_s * share
        elapsed += span.duration_s

    if not spans:
        seconds = [route.duration_s * mile / total_miles if total_miles else 0.0 for mile in miles]

    return RouteProfile(points=route.points, miles=miles, seconds=seconds)


def checkpoint_miles(total_miles, interval_miles):
    """Mile 0, every interval, and always the destination."""
    miles = []
    mile = 0.0
    while mile < total_miles - 1e-6:
        miles.append(mile)
        mile += interval_miles
    miles.append(total_miles)
    return miles


def place_checkpoints(profile, departure, interval_miles):
    """Checkpoints with position, ETA (UTC), time zone and the miles each stands for."""
    miles = checkpoint_miles(profile.total_miles, interval_miles)
    departure_utc = departure.astimezone(timezone.utc)

    checkpoints = []
    for seq, mile in enumerate(miles):
        lat, lon = profile.point_at(mile)
        back = (mile - miles[seq - 1]) / 2 if seq > 0 else 0.0
        ahead = (miles[seq + 1] - mile) / 2 if seq + 1 < len(miles) else 0.0
        checkpoints.append(
            {
                'seq': seq,
                'mile': mile,
                'lat': lat,
                'lon': lon,
                'eta': departure_utc + timedelta(seconds=profile.seconds_at(mile)),
                'timezone': timezone_at(lat, lon),
                'miles_represented': back + ahead,
                'covers_from_mile': mile - back,
                'covers_to_mile': mile + ahead,
            }
        )
    return checkpoints


def to_utc_iso(moment: datetime):
    return moment.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
