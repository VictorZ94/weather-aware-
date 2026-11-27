from datetime import datetime, timedelta, timezone

from django.test import SimpleTestCase

from here.routing import Span, TruckRoute
from trips.geometry import METRES_PER_MILE, cumulative_miles, thin
from trips.sampling import CHECKPOINT_GAPS_MILES, build_profile, checkpoint_miles, place_checkpoints

DEPARTURE = datetime(2026, 10, 12, 6, 0, tzinfo=timezone(timedelta(hours=-6)))


def straight_route(total_miles, spans=None, points=201):
    """A route heading east along latitude 40 from Denver's longitude."""
    miles_per_degree = cumulative_miles([(40, -105), (40, -104)])[-1]
    line = [(40.0, -105 + total_miles / miles_per_degree * i / (points - 1)) for i in range(points)]
    length_m = total_miles * METRES_PER_MILE
    if spans is None:
        spans = [Span(0, length_m, total_miles * 60)]  # 60 mph throughout
    return TruckRoute(points=line, length_m=length_m, duration_s=sum(s.duration_s for s in spans), spans=spans)


class CheckpointPlacementTests(SimpleTestCase):
    def test_320_miles_follow_gaps_of_10_25_50_in_turn(self):
        self.assertEqual(
            checkpoint_miles(320), [0, 10, 35, 85, 95, 120, 170, 180, 205, 255, 265, 290, 320]
        )

    def test_gaps_cycle_and_the_last_checkpoint_is_the_destination(self):
        for total in (800, 810, 165, 40, 1000.4):
            miles = checkpoint_miles(total)
            self.assertEqual(miles[0], 0)
            self.assertEqual(miles[-1], total)
            gaps = [b - a for a, b in zip(miles, miles[1:-1])]
            expected = [CHECKPOINT_GAPS_MILES[i % len(CHECKPOINT_GAPS_MILES)] for i in range(len(gaps))]
            self.assertEqual(gaps, expected, total)
            self.assertLessEqual(miles[-1] - miles[-2], CHECKPOINT_GAPS_MILES[len(gaps) % len(CHECKPOINT_GAPS_MILES)])

    def test_short_routes(self):
        self.assertEqual(checkpoint_miles(7), [0, 7])
        self.assertEqual(checkpoint_miles(10), [0, 10])
        self.assertEqual(checkpoint_miles(30), [0, 10, 30])

    def test_seq_numbers_the_checkpoints_in_order(self):
        checkpoints = place_checkpoints(build_profile(straight_route(800)), DEPARTURE)

        self.assertEqual(len(checkpoints), len(checkpoint_miles(800)))
        self.assertEqual([c['seq'] for c in checkpoints], list(range(len(checkpoints))))

    def test_etas_increase_and_the_last_is_the_arrival(self):
        route = straight_route(810)
        checkpoints = place_checkpoints(build_profile(route), DEPARTURE)

        etas = [c['eta'] for c in checkpoints]
        self.assertEqual(etas, sorted(set(etas)))
        self.assertEqual(etas[0], DEPARTURE)
        self.assertLess(abs((etas[-1] - DEPARTURE).total_seconds() - route.duration_s), 1)
        self.assertEqual(etas[0].utcoffset(), timedelta(0))

    def test_mile_120_at_60_mph_is_reached_after_2h(self):
        checkpoints = place_checkpoints(build_profile(straight_route(300)), DEPARTURE)

        at_120 = next(c for c in checkpoints if c['mile'] == 120)
        self.assertLess(abs((at_120['eta'] - DEPARTURE).total_seconds() - 120 * 60), 2)

    def test_eta_follows_the_speed_of_each_span(self):
        # First half of the points at 60 mph, second half at 30 mph.
        half_m = 50 * METRES_PER_MILE
        route = straight_route(100, spans=[Span(0, half_m, 50 * 60), Span(100, half_m, 100 * 60)])
        profile = build_profile(route)

        self.assertAlmostEqual(profile.seconds_at(25), 25 * 60, delta=2)
        self.assertAlmostEqual(profile.seconds_at(50), 50 * 60, delta=2)
        self.assertAlmostEqual(profile.seconds_at(75), 50 * 60 + 25 * 120, delta=2)

    def test_miles_represented_sum_to_the_route_length(self):
        for total in (800, 813.7, 7):
            checkpoints = place_checkpoints(build_profile(straight_route(total)), DEPARTURE)
            self.assertAlmostEqual(sum(c['miles_represented'] for c in checkpoints), total, places=6)

    def test_checkpoints_lie_on_the_line_and_carry_their_time_zone(self):
        checkpoints = place_checkpoints(build_profile(straight_route(800)), DEPARTURE)

        self.assertTrue(all(abs(c['lat'] - 40.0) < 1e-9 for c in checkpoints))
        self.assertEqual(checkpoints[0]['timezone'], 'America/Denver')
        self.assertEqual(checkpoints[-1]['timezone'], 'America/Chicago')


class ThinningTests(SimpleTestCase):
    def test_keeps_both_ends_and_nearly_all_of_the_length(self):
        route = straight_route(100, points=5001)
        miles = cumulative_miles(route.points)

        thinned = thin(route.points, miles)

        self.assertEqual(thinned[0], route.points[0])
        self.assertEqual(thinned[-1], route.points[-1])
        self.assertLess(len(thinned), len(route.points) / 3)
        self.assertAlmostEqual(cumulative_miles(thinned)[-1], miles[-1], delta=miles[-1] * 0.01)
