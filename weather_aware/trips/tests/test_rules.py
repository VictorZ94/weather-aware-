from django.test import SimpleTestCase, override_settings

from trips import rules
from trips.risk import classify, route_totals

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = range(5)


def weather(gust=0, rain=0.0, snow=0.0, wind=0):
    return {'wind_gust_mph': gust, 'wind_speed_mph': wind, 'rain_in': rain, 'snow_in': snow}


class ThresholdTests(SimpleTestCase):
    """Every boundary in the table. A shared boundary goes to the higher level."""

    def test_wind(self):
        cases = [
            (0, LOW), (24.9, LOW), (25, MODERATE), (34.9, MODERATE), (35, HIGH), (44.9, HIGH),
            (45, SEVERE), (54.9, SEVERE), (55, NO_TRAVEL), (80, NO_TRAVEL),
        ]  # fmt: skip
        for mph, level in cases:
            self.assertEqual(rules.wind_level(mph), level, mph)

    def test_rain(self):
        cases = [
            (0, LOW), (0.09, LOW), (0.10, MODERATE), (0.24, MODERATE), (0.25, HIGH), (0.49, HIGH),
            (0.50, SEVERE), (1.00, SEVERE), (1.01, NO_TRAVEL),
        ]  # fmt: skip
        for inches, level in cases:
            self.assertEqual(rules.rain_level(inches), level, inches)

    def test_snow(self):
        cases = [
            (0, LOW), (0.49, LOW), (0.5, MODERATE), (0.99, MODERATE), (1.0, HIGH), (1.99, HIGH),
            (2.0, SEVERE), (3.0, SEVERE), (3.01, NO_TRAVEL),
        ]  # fmt: skip
        for inches, level in cases:
            self.assertEqual(rules.snow_level(inches), level, inches)


class LoadRuleTests(SimpleTestCase):
    def test_wind_55_is_no_travel_for_any_load(self):
        level, rule = rules.apply_load_rules(55, 1)
        self.assertEqual(level, NO_TRAVEL)
        self.assertIn('any load', rule)

    def test_wind_45_to_54_depends_on_30000_lb(self):
        self.assertEqual(rules.apply_load_rules(45, 30_000), (SEVERE, None))
        level, rule = rules.apply_load_rules(45, 30_001)
        self.assertEqual(level, NO_TRAVEL)
        self.assertIn('30,000 lb', rule)
        self.assertEqual(rules.apply_load_rules(54.9, 30_001)[0], NO_TRAVEL)
        # Below 45 mph the 30,000 lb rule does not apply.
        self.assertEqual(rules.apply_load_rules(44.9, 30_001), (HIGH, None))

    def test_wind_35_to_44_depends_on_40000_lb(self):
        self.assertEqual(rules.apply_load_rules(35, 40_000), (HIGH, None))
        level, rule = rules.apply_load_rules(35, 40_001)
        self.assertEqual(level, SEVERE)
        self.assertIn('40,000 lb', rule)
        self.assertEqual(rules.apply_load_rules(44.9, 40_001)[0], SEVERE)
        # Below 35 mph no load rule applies, however heavy.
        self.assertEqual(rules.apply_load_rules(34.9, 80_000), (MODERATE, None))


class ClassifyTests(SimpleTestCase):
    def test_38_mph_with_42000_lb_is_severe_and_names_the_rule(self):
        result = classify(weather(gust=38), 42_000)

        self.assertEqual(result['level'], SEVERE)
        self.assertEqual(result['levels'], {'wind': SEVERE, 'rain': LOW, 'snow': LOW})
        self.assertEqual(result['deciding_condition'], 'Wind gusts 38 mph')
        self.assertEqual(result['load_rule'], 'Wind 35–44 mph with cargo over 40,000 lb: Severe')

    def test_same_wind_with_a_lighter_load_is_high_with_no_rule(self):
        result = classify(weather(gust=38), 20_000)

        self.assertEqual(result['level'], HIGH)
        self.assertIsNone(result['load_rule'])

    def test_worst_condition_wins(self):
        result = classify(weather(gust=26, rain=0.3, snow=2.5), 10_000)

        self.assertEqual(result['levels'], {'wind': MODERATE, 'rain': HIGH, 'snow': SEVERE})
        self.assertEqual(result['level'], SEVERE)
        self.assertEqual(result['deciding_condition'], 'Snow 2.5 in/hr')

    def test_load_rules_change_wind_only(self):
        result = classify(weather(gust=10, rain=0.3), 45_000)

        self.assertEqual(result['levels']['rain'], HIGH)
        self.assertEqual(result['level'], HIGH)
        self.assertIsNone(result['load_rule'])

    def test_calm_weather_is_low(self):
        result = classify(weather(gust=10), 45_000)

        self.assertEqual(result['level'], LOW)
        self.assertEqual(result['deciding_condition'], 'No significant weather')

    def test_gusts_are_used_by_default_and_sustained_wind_on_request(self):
        windy = weather(gust=50, wind=20)
        self.assertEqual(classify(windy, 10_000)['level'], SEVERE)
        with override_settings(RISK_WIND_SOURCE='sustained'):
            self.assertEqual(classify(windy, 10_000)['level'], LOW)


def checkpoint(level, miles, start, condition='x'):
    return {
        'level': level,
        'miles_represented': miles,
        'covers_from_mile': start,
        'covers_to_mile': start + miles,
        'deciding_condition': condition,
    }


class RouteTotalsTests(SimpleTestCase):
    def test_miles_per_level_and_mile_weighted_average(self):
        totals = route_totals([checkpoint(LOW, 60, 0), checkpoint(HIGH, 30, 60), checkpoint(None, 10, 90)])

        self.assertEqual(totals['miles_by_level']['low'], 60)
        self.assertEqual(totals['miles_by_level']['high'], 30)
        self.assertEqual(totals['miles_by_level']['unknown'], 10)
        # (0*60 + 2*30) / 90 known miles
        self.assertAlmostEqual(totals['average_risk'], 60 / 90)

    def test_worst_segment_is_the_longest_stretch_at_the_worst_level(self):
        totals = route_totals(
            [
                checkpoint(SEVERE, 10, 0, 'short'),
                checkpoint(LOW, 10, 10),
                checkpoint(SEVERE, 10, 20, 'long'),
                checkpoint(SEVERE, 10, 30),
                checkpoint(HIGH, 10, 40),
            ]
        )

        self.assertEqual(
            totals['worst_segment'],
            {'from_mile': 20, 'to_mile': 40, 'risk_level': 'severe', 'description': 'long'},
        )

    def test_all_low_has_no_worst_segment_and_all_unknown_has_no_average(self):
        self.assertIsNone(route_totals([checkpoint(LOW, 10, 0)])['worst_segment'])
        unknown = route_totals([checkpoint(None, 10, 0)])
        self.assertIsNone(unknown['average_risk'])
        self.assertIsNone(unknown['worst_segment'])
