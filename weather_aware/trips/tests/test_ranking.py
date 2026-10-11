from django.test import SimpleTestCase

from trips.ranking import rank_routes


def route(route_id, minutes=600, distance=500, average=0.0, **miles):
    by_level = {'low': 0, 'moderate': 0, 'high': 0, 'severe': 0, 'no_travel': 0, 'unknown': 0}
    by_level.update(miles)
    by_level['low'] = distance - sum(by_level.values())
    return {
        'id': route_id,
        'duration_minutes': minutes,
        'distance_miles': distance,
        'average_risk': average,
        'miles_by_level': by_level,
    }


class RankingTests(SimpleTestCase):
    def ranked(self, routes):
        recommended, reason, all_no_travel = rank_routes(routes)
        return [r['id'] for r in routes], recommended, reason, all_no_travel

    def test_fewest_severe_miles_wins_even_if_slower(self):
        order, recommended, reason, _ = self.ranked(
            [route('fast', minutes=500, severe=50, average=0.4), route('safe', minutes=700, average=0.1)]
        )

        self.assertEqual(order, ['safe', 'fast'])
        self.assertEqual(recommended, 'safe')
        self.assertEqual(reason, 'Fewest Severe miles (0 vs 50)')

    def test_then_fewest_high_miles(self):
        order, _, reason, _ = self.ranked(
            [route('a', high=40, average=0.2, minutes=500), route('b', high=10, average=0.3, minutes=700)]
        )

        self.assertEqual(order, ['b', 'a'])
        self.assertEqual(reason, 'Fewest High miles (10 vs 40)')

    def test_then_lowest_average_risk(self):
        order, _, reason, _ = self.ranked(
            [route('a', average=0.9, minutes=500), route('b', average=0.4, minutes=700)]
        )

        self.assertEqual(order, ['b', 'a'])
        self.assertEqual(reason, 'Lowest average risk (0.4 vs 0.9)')

    def test_then_shortest_travel_time(self):
        order, _, reason, _ = self.ranked([route('a', minutes=624), route('b', minutes=600)])

        self.assertEqual(order, ['b', 'a'])
        self.assertEqual(reason, 'All routes equally safe; fastest by 24 min')

    def test_differences_under_five_miles_count_as_ties(self):
        # 2 vs 0 Severe miles both round to 0, so time decides.
        order, _, _, _ = self.ranked([route('a', severe=0, minutes=700), route('b', severe=2, minutes=600)])

        self.assertEqual(order, ['b', 'a'])

    def test_every_route_gets_a_rank(self):
        routes = [route('a', minutes=3), route('b', minutes=1), route('c', minutes=2)]
        rank_routes(routes)

        self.assertEqual([(r['id'], r['rank']) for r in routes], [('b', 1), ('c', 2), ('a', 3)])

    def test_no_travel_route_is_never_recommended_over_a_drivable_one(self):
        order, recommended, reason, all_no_travel = self.ranked(
            [route('blocked', minutes=300, no_travel=10), route('open', minutes=900, severe=200, average=2.0)]
        )

        self.assertEqual(order, ['open', 'blocked'])
        self.assertEqual(recommended, 'open')
        self.assertEqual(reason, 'The only route without No Travel conditions or missing weather.')
        self.assertFalse(all_no_travel)

    def test_when_every_route_has_no_travel_the_fewest_miles_ranks_first_with_a_warning(self):
        order, recommended, reason, all_no_travel = self.ranked(
            [route('a', no_travel=80), route('b', no_travel=20)]
        )

        self.assertEqual(order, ['b', 'a'])
        self.assertEqual(recommended, 'b')
        self.assertIn('fewest No Travel miles (20 vs 80)', reason)
        self.assertIn('later departure', reason)
        self.assertTrue(all_no_travel)

    def test_route_missing_over_a_fifth_of_its_weather_is_not_recommended(self):
        order, recommended, _, _ = self.ranked(
            [route('blind', minutes=300, unknown=150), route('known', minutes=900, high=100, average=0.4)]
        )

        self.assertEqual(order, ['known', 'blind'])
        self.assertEqual(recommended, 'known')

    def test_nothing_is_recommended_when_weather_is_missing_everywhere(self):
        routes = [route('a', unknown=500, average=None), route('b', unknown=500, average=None, minutes=500)]

        order, recommended, reason, all_no_travel = self.ranked(routes)

        self.assertEqual(order, ['b', 'a'])  # still ordered, by time
        self.assertIsNone(recommended)
        self.assertIsNone(reason)
        self.assertFalse(all_no_travel)

    def test_single_route(self):
        _, recommended, reason, _ = self.ranked([route('only')])

        self.assertEqual(recommended, 'only')
        self.assertEqual(reason, 'The only truck route available.')
