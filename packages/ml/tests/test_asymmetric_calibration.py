"""Asymmetric split CQR: P1 protocol p1-v3 (decision Q-03, 2026-10-06).

The lower and the upper side of the band are calibrated separately on June, each at the
level 1 - alpha / 2 (Romano, Patterson and Candès 2019), so each side gets its own share of
the misses. Method "symmetric" keeps the p1-v2 calibration so its results stay reproducible.

Small, explicitly synthetic scenarios; never read the private Austin files.
"""
from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import load_config
from silentwatt_ml.models.calibration import apply_calibration, calibrate

ALPHA = 0.1


def calibration_settings(method, minimum_slots: int = 1, minimum_days: int = 1) -> dict:
    return {'method': method, 'alpha': ALPHA, 'minimum_days': minimum_days, 'minimum_slots': minimum_slots}


def june_slots(target: list[float]) -> pd.DataFrame:
    """Daily-qualified calibration slots around a fixed raw band q05 = 10, q50 = 20, q95 = 30."""
    return pd.DataFrame({'target': np.asarray(target, dtype=float), 'q05': 10.0, 'q50': 20.0, 'q95': 30.0,
                         'eligible': True, 'local_date': '2018-06-01'})


def hundred_slots_with_misses_on_both_sides() -> pd.DataFrame:
    # 20 slots above the raw band (31 ... 50), 5 below it (9 ... 5) and 75 inside it (20).
    above = [30 + step for step in range(1, 21)]
    below = [10 - step for step in range(1, 6)]
    inside = [20] * 75
    return june_slots(above + below + inside)


def random_june_slots(generator: np.random.Generator, slot_count: int) -> pd.DataFrame:
    """Random raw bands and targets with many zero (off) slots and ties, like June air1."""
    q05 = np.round(generator.uniform(0, 1, slot_count), 3)
    q95 = q05 + np.round(generator.uniform(0, 2, slot_count), 3)
    target = np.round(generator.gamma(1.5, 1.0, slot_count), 3)
    target[generator.random(slot_count) < 0.4] = 0.0
    return pd.DataFrame({'target': target, 'q05': q05, 'q50': (q05 + q95) / 2, 'q95': q95,
                         'eligible': True, 'local_date': '2018-06-01'})


class AsymmetricCalibrationTests(unittest.TestCase):
    def test_each_side_is_calibrated_with_the_rank_for_alpha_half(self):
        profile = calibrate(hundred_slots_with_misses_on_both_sides(), calibration_settings('asymmetric'))
        self.assertEqual(profile['status'], 'calibrated')
        self.assertEqual(profile['method'], 'asymmetric')
        # n = 100 slots: rank = ceil(101 * (1 - 0.1 / 2)) = ceil(95.95) = 96 for each side.
        self.assertEqual(profile['rank'], 96)
        # Upper scores y - 30, ascending: 5 below (-25 ... -21), 75 inside (-10), 20 above (1 ... 20).
        # The 96th smallest is 16.
        self.assertEqual(profile['qhat_upper'], 16.0)
        # Lower scores 10 - y, ascending: 20 above (-40 ... -21), 75 inside (-10), 5 below (1 ... 5).
        # The 96th smallest is 1.
        self.assertEqual(profile['qhat_lower'], 1.0)
        # There is no single symmetric correction under this method.
        self.assertIsNone(profile['qhat'])

    def test_each_side_misses_at_most_alpha_half_of_the_june_slots(self):
        june = hundred_slots_with_misses_on_both_sides()
        calibrated = apply_calibration(june, calibrate(june, calibration_settings('asymmetric')))
        # lower = 10 - 1 = 9 and upper = 30 + 16 = 46 on every slot.
        self.assertTrue(calibrated['lower'].eq(9.0).all())
        self.assertTrue(calibrated['upper'].eq(46.0).all())
        # Above 46: targets 47 ... 50 (4 slots). Below 9: targets 8 ... 5 (4 slots).
        self.assertAlmostEqual((calibrated['target'] > calibrated['upper']).mean(), 0.04)
        self.assertAlmostEqual((calibrated['target'] < calibrated['lower']).mean(), 0.04)

    def test_symmetric_band_puts_its_misses_on_the_upper_side(self):
        # The p1-v2 behaviour that decision Q-03 replaces, on the same June slots.
        june = hundred_slots_with_misses_on_both_sides()
        profile = calibrate(june, calibration_settings('symmetric'))
        # n = 100 slots: rank = ceil(101 * (1 - 0.1)) = ceil(90.9) = 91. The scores
        # max(10 - y, y - 30) are 75 times -10, then 1, 1, 2, 2, ..., 5, 5, 6, 7, ..., 20;
        # the 91st smallest is 11.
        self.assertEqual(profile['rank'], 91)
        self.assertEqual(profile['qhat'], 11.0)
        calibrated = apply_calibration(june, profile)
        # lower = max(0, 10 - 11) = 0 and upper = 30 + 11 = 41: no slot falls below the band,
        # 9 slots (42 ... 50) rise above it.
        self.assertTrue(calibrated['lower'].eq(0.0).all())
        self.assertTrue(calibrated['upper'].eq(41.0).all())
        self.assertAlmostEqual((calibrated['target'] > calibrated['upper']).mean(), 0.09)
        self.assertEqual((calibrated['target'] < calibrated['lower']).mean(), 0.0)

    def test_asymmetric_method_follows_the_formula_on_random_june_slots(self):
        generator = np.random.default_rng(31)
        for slot_count in (30, 250, 2592):
            with self.subTest(slots=slot_count):
                june = random_june_slots(generator, slot_count)
                target = june['target'].to_numpy()
                q05 = june['q05'].to_numpy()
                q95 = june['q95'].to_numpy()
                profile = calibrate(june, calibration_settings('asymmetric'))
                rank = math.ceil((slot_count + 1) * (1 - ALPHA / 2))
                expected_qhat_lower = max(0.0, np.sort(q05 - target)[rank - 1])
                expected_qhat_upper = max(0.0, np.sort(target - q95)[rank - 1])
                self.assertEqual(profile['rank'], rank)
                self.assertEqual(profile['qhat_lower'], expected_qhat_lower)
                self.assertEqual(profile['qhat_upper'], expected_qhat_upper)
                # In-sample, each side misses fewer than alpha / 2 of the calibration slots.
                calibrated = apply_calibration(june, profile)
                self.assertLess((calibrated['target'] > calibrated['upper']).mean(), ALPHA / 2)
                self.assertLess((calibrated['target'] < calibrated['lower']).mean(), ALPHA / 2)


class ClampAtZeroTests(unittest.TestCase):
    def test_corrections_floor_at_zero_so_the_band_never_shrinks(self):
        # Every target inside the raw band: all scores are negative on both sides.
        june = june_slots([20.0] * 30)
        profile = calibrate(june, calibration_settings('asymmetric'))
        self.assertEqual(profile['qhat_lower'], 0.0)
        self.assertEqual(profile['qhat_upper'], 0.0)
        calibrated = apply_calibration(june, profile)
        self.assertTrue(calibrated['lower'].eq(june['q05']).all())
        self.assertTrue(calibrated['upper'].eq(june['q95']).all())

    def test_lower_bound_stops_at_zero(self):
        # June gives qhat_lower = 1; a July slot with q05 = 0.25 would otherwise get -0.75.
        june = hundred_slots_with_misses_on_both_sides()
        profile = calibrate(june, calibration_settings('asymmetric'))
        july = pd.DataFrame({'target': [0.0, 3.0], 'q05': [0.25, 4.0], 'q50': [1.0, 5.0], 'q95': [2.0, 6.0]})
        calibrated = apply_calibration(july, profile)
        self.assertEqual(calibrated['lower'].tolist(), [0.0, 3.0])
        self.assertEqual(calibrated['upper'].tolist(), [18.0, 22.0])


class PendingCalibrationTests(unittest.TestCase):
    def assert_pending(self, profile: dict, frame: pd.DataFrame) -> None:
        self.assertEqual(profile['status'], 'calibration_pending')
        self.assertEqual(profile['reason'], 'insufficient_calibration_support')
        self.assertIsNone(profile['qhat'])
        self.assertIsNone(profile['qhat_lower'])
        self.assertIsNone(profile['qhat_upper'])
        calibrated = apply_calibration(frame, profile)
        self.assertTrue(calibrated[['lower', 'upper']].isna().all().all())
        self.assertTrue(calibrated['calibration_status'].eq('calibration_pending').all())

    def test_too_few_slots_or_days_leave_the_band_empty(self):
        june = hundred_slots_with_misses_on_both_sides()
        for method in ('symmetric', 'asymmetric'):
            with self.subTest(method=method, missing='slots'):
                profile = calibrate(june, calibration_settings(method, minimum_slots=101))
                self.assertEqual(profile['method'], method)
                self.assert_pending(profile, june)
            with self.subTest(method=method, missing='days'):
                # All 100 slots lie on a single local day.
                self.assert_pending(calibrate(june, calibration_settings(method, minimum_days=2)), june)

    def test_each_side_needs_more_june_slots_than_the_symmetric_band(self):
        june = june_slots([20.0] * 18)
        # n = 18: the asymmetric rank ceil(19 * 0.95) = ceil(18.05) = 19 is above n.
        asymmetric = calibrate(june, calibration_settings('asymmetric'))
        self.assertEqual(asymmetric['rank'], 19)
        self.assert_pending(asymmetric, june)
        # The symmetric rank ceil(19 * 0.9) = ceil(17.1) = 18 still exists.
        symmetric = calibrate(june, calibration_settings('symmetric'))
        self.assertEqual(symmetric['rank'], 18)
        self.assertEqual(symmetric['status'], 'calibrated')


class SymmetricMethodTests(unittest.TestCase):
    def test_symmetric_method_keeps_the_p1_v2_band(self):
        generator = np.random.default_rng(7)
        for slot_count in (30, 250, 2592):
            with self.subTest(slots=slot_count):
                june = random_june_slots(generator, slot_count)
                target = june['target'].to_numpy()
                q05 = june['q05'].to_numpy()
                q95 = june['q95'].to_numpy()
                profile = calibrate(june, calibration_settings('symmetric'))
                # p1-v2: one score max(q05 - y, y - q95), rank ceil((n + 1) * (1 - alpha)), floor 0.
                rank = math.ceil((slot_count + 1) * (1 - ALPHA))
                expected_qhat = max(0.0, np.sort(np.maximum(q05 - target, target - q95))[rank - 1])
                self.assertEqual(profile['method'], 'symmetric')
                self.assertEqual(profile['rank'], rank)
                self.assertEqual(profile['qhat'], expected_qhat)
                # The same correction is recorded for both sides.
                self.assertEqual(profile['qhat_lower'], expected_qhat)
                self.assertEqual(profile['qhat_upper'], expected_qhat)
                calibrated = apply_calibration(june, profile)
                np.testing.assert_array_equal(calibrated['lower'], np.maximum(q05 - expected_qhat, 0))
                np.testing.assert_array_equal(calibrated['upper'], q95 + expected_qhat)

    def test_unknown_method_is_rejected(self):
        june = hundred_slots_with_misses_on_both_sides()
        for unknown in ('one_sided', 'Asymmetric', '', None):
            with self.subTest(method=unknown):
                with self.assertRaisesRegex(ValueError, 'calibration method'):
                    calibrate(june, calibration_settings(unknown))


class P1V3ConfigTests(unittest.TestCase):
    def setUp(self):
        repository = Path(__file__).resolve().parents[3]
        self.raw = json.loads((repository / 'configs/ml/austin-2018.json').read_text())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'config.json'

    def load(self):
        self.path.write_text(json.dumps(self.raw))
        return load_config(self.path)

    def test_main_config_uses_protocol_p1_v3_with_asymmetric_calibration(self):
        p1 = self.load().raw['p1']
        self.assertEqual(p1['protocol_version'], 'p1-v3')
        self.assertEqual(p1['calibration']['method'], 'asymmetric')

    def test_symmetric_method_is_accepted_to_reproduce_p1_v2(self):
        self.raw['p1']['calibration']['method'] = 'symmetric'
        self.assertEqual(self.load().raw['p1']['calibration']['method'], 'symmetric')

    def test_other_calibration_methods_are_rejected(self):
        for bad_method in ('one_sided', 'Asymmetric', '', None, 1, True):
            with self.subTest(method=bad_method):
                self.raw['p1']['calibration']['method'] = bad_method
                with self.assertRaisesRegex(ValueError, 'calibration method'):
                    self.load()

    def test_calibration_method_is_required(self):
        del self.raw['p1']['calibration']['method']
        with self.assertRaisesRegex(ValueError, 'Invalid nested config'):
            self.load()

    def test_only_protocol_p1_v3_is_accepted(self):
        for old_or_unknown in ('p1-v2', 'p1-v1', 'p1-v4', '', None):
            with self.subTest(protocol_version=old_or_unknown):
                self.raw['p1']['protocol_version'] = old_or_unknown
                with self.assertRaisesRegex(ValueError, 'protocol_version'):
                    self.load()


if __name__ == '__main__':
    unittest.main()
