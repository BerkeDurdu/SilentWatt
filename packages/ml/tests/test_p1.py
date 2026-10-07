"""Synthetic P1 checks: no private source data, final-test selection, or metric shortcuts."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import load_config
from silentwatt_ml.data.daily import daily_quality, freeze_flags
from silentwatt_ml.data.readers import sha256_file
from silentwatt_ml.models.calibration import apply_calibration, calibrate, ordered_quantiles
from silentwatt_ml.models.comparison import run_comparison
from silentwatt_ml.models.evaluation import grouped_metrics, metrics


class QualityCalibrationTests(unittest.TestCase):
    def frame(self, day='2018-01-01', timezone='UTC'):
        start = pd.Timestamp(day, tz=timezone)
        end = start + pd.DateOffset(days=1)
        ts = pd.date_range(start, end, freq='15min', inclusive='left').tz_convert('UTC')
        return pd.DataFrame({'ts_utc': ts, 'target': np.arange(len(ts)) / 100 + 1,
                             'target_quality': 'ok', 'temperature_c': 20., 'local_date': day})

    def settings(self):
        return {'minimum_coverage': .95, 'frozen_run_slots': 16, 'block_frozen_days': True}

    def test_cqr_finite_sample_rank_and_pending_boundary(self):
        frame = pd.DataFrame({'target': np.arange(9.), 'q05': 0., 'q50': 0., 'q95': 0.,
                              'eligible': True, 'local_date': '2018-06-01'})
        settings = {'method': 'symmetric', 'alpha': .1, 'minimum_days': 1, 'minimum_slots': 1}
        profile = calibrate(frame, settings)
        self.assertEqual(profile['rank'], 9)
        self.assertEqual(profile['qhat'], 8.)
        self.assertEqual(calibrate(frame.iloc[:8], settings)['status'], 'calibration_pending')
        self.assertEqual(calibrate(frame, {**settings, 'minimum_days': 2})['status'], 'calibration_pending')
        self.assertEqual(calibrate(frame, {**settings, 'minimum_slots': 10})['status'], 'calibration_pending')
        pending = apply_calibration(frame, calibrate(frame.iloc[:8], settings))
        self.assertTrue(pending[['lower', 'upper']].isna().all().all())

    def test_ordering_nonnegative_domain_and_no_shrinkage(self):
        np.testing.assert_array_equal(ordered_quantiles(np.array([[3., -1., 2.]])), [[0., 2., 3.]])
        with self.assertRaises(ValueError):
            ordered_quantiles(np.array([[0., np.inf, 1.]]))
        frame = pd.DataFrame({'target': [1.] * 20, 'q05': 0., 'q50': 1., 'q95': 2.,
                              'eligible': True, 'local_date': '2018-06-01'})
        profile = calibrate(frame, {'method': 'symmetric', 'alpha': .1, 'minimum_days': 1, 'minimum_slots': 1})
        self.assertEqual(profile['qhat'], 0.)
        after = apply_calibration(frame, profile)
        self.assertTrue(after['lower'].eq(frame['q05']).all())
        self.assertTrue(after['upper'].eq(frame['q95']).all())

    def test_freeze_flags_are_past_only_and_zero_is_not_freeze(self):
        frame = self.frame()
        frame['target'] = 1.
        flags = freeze_flags(frame, 16)
        self.assertFalse(flags.iloc[:15].any())
        self.assertTrue(flags.iloc[15:].all())
        changed = frame.copy()
        changed.loc[40:, 'target'] = np.arange(len(frame) - 40) + 2.
        pd.testing.assert_series_equal(flags.iloc[:40], freeze_flags(changed, 16).iloc[:40])
        frame['target'] = 0.
        self.assertFalse(freeze_flags(frame, 16).any())
        frame['target'] = 1.
        frame.loc[15, 'target'] = np.nan
        self.assertFalse(freeze_flags(frame, 16).iloc[:31].any())
        frame = frame.drop(index=40)
        self.assertFalse(freeze_flags(frame, 16).loc[41:55].any())

    def test_dst_denominators_and_daily_failure_reasons(self):
        for day, expected in [('2018-03-11', 92), ('2018-11-04', 100)]:
            frame, days = daily_quality(self.frame(day, 'America/Chicago'), 'America/Chicago', self.settings())
            self.assertEqual(days.iloc[0]['expected_slots'], expected)
            self.assertTrue(frame['eligible'].all())
        frame = self.frame()
        frame.loc[:4, 'target'] = np.nan
        frame.loc[:1, 'target_quality'] = 'missing_row'
        frame.loc[2, 'target_quality'] = 'null_target'
        frame.loc[3, 'target_quality'] = 'negative_target'
        frame.loc[4, 'target_quality'] = 'invalid_target'
        frame.loc[5, 'temperature_c'] = np.nan
        frame.loc[6, 'temperature_c'] = 30.
        result, days = daily_quality(frame, 'UTC', self.settings(), (19., 21.))
        day = days.iloc[0]
        self.assertEqual(day['valid_joint_slots'], 90)
        self.assertEqual(day['missing_row_slots'], 2)
        self.assertEqual(day['negative_target_slots'], 1)
        self.assertEqual(day['invalid_target_slots'], 1)
        self.assertEqual(day['missing_weather_slots'], 1)
        self.assertEqual(day['out_of_support_slots'], 1)
        self.assertIn('insufficient_daily_coverage', day['reasons'])
        self.assertIn('temperature_out_of_support', day['reasons'])
        self.assertFalse(result['eligible'].any())

    def test_frozen_day_gate_and_valid_zero_off_day(self):
        frame = self.frame()
        frame['target'] = 1.
        result, days = daily_quality(frame, 'UTC', self.settings())
        self.assertIn('frozen_suspected', days.iloc[0]['reasons'])
        self.assertFalse(result['eligible'].any())
        frame['target'] = 0.
        result, days = daily_quality(frame, 'UTC', self.settings())
        self.assertTrue(result['eligible'].all())
        self.assertEqual(days.iloc[0]['frozen_suspected_slots'], 0)

    def test_coverage_boundary_and_freeze_across_midnight(self):
        frame = self.frame()
        frame.loc[:3, 'target'] = np.nan
        _, days = daily_quality(frame, 'UTC', self.settings())
        self.assertTrue(days.iloc[0]['day_eligible'])
        frame.loc[4, 'target'] = np.nan
        _, days = daily_quality(frame, 'UTC', self.settings())
        self.assertFalse(days.iloc[0]['day_eligible'])
        frame = pd.concat([self.frame(), self.frame('2018-01-02')], ignore_index=True)
        frame.loc[88:110, 'target'] = 9.
        flags = freeze_flags(frame, 16)
        self.assertFalse(flags.iloc[:103].any())
        self.assertTrue(flags.iloc[103:111].all())

    def test_freeze_flag_only_mode_does_not_silently_exclude_slots(self):
        frame = self.frame()
        frame['target'] = 1.
        result, days = daily_quality(frame, 'UTC', {**self.settings(), 'block_frozen_days': False})
        self.assertTrue(result['frozen_suspected'].any())
        self.assertTrue(result['eligible'].all())
        self.assertEqual(days.iloc[0]['valid_joint_slots'], 96)

    def test_month_metrics_use_actual_denominators(self):
        frame = pd.DataFrame({'household_id': 999999, 'model': 'B0', 'split': 'development',
                              'month': ['2018-06', '2018-07', '2018-07', '2018-07'],
                              'target': [1., 3., 3., 1.], 'q05': 0., 'q50': 1., 'q95': 2.,
                              'lower': 0., 'upper': 2., 'eligible': True, 'slot_supported': True})
        records = {r['month']: r for r in grouped_metrics(frame, 0.3) if r['population'] == 'daily_qualified'}
        self.assertEqual(records['2018-06']['calibrated_coverage'], 1.)
        self.assertAlmostEqual(records['2018-07']['calibrated_coverage'], 1 / 3)
        self.assertEqual(records['all']['calibrated_coverage'], .5)

    def test_empty_metrics_are_null_not_zero_success(self):
        frame = pd.DataFrame({'target': [1.], 'q05': [0.], 'q50': [1.], 'q95': [2.],
                              'lower': [np.nan], 'upper': [np.nan]})
        result = metrics(frame, pd.Series([False]), 0.3)
        self.assertIsNone(result['raw_coverage'])
        self.assertIsNone(result['mean_pinball'])
        self.assertEqual(result['status'], 'no_eligible_slots')
        self.assertIsNone(metrics(frame, pd.Series([True]), 0.3)['calibrated_coverage'])


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'data'
        self.data.mkdir()
        repo = Path(__file__).resolve().parents[3]
        self.raw = json.loads((repo / 'configs/ml/austin-2018.json').read_text())
        self.raw['display_timezone'] = 'UTC'
        self.raw['analysis_window_utc'] = {'start': '2018-01-01T00:00:00Z', 'end': '2018-01-10T00:00:00Z'}
        self.raw['splits_local_date'] = {'train': ['2018-01-01', '2018-01-04'],
                                        'calibration': ['2018-01-04', '2018-01-06'],
                                        'development': ['2018-01-06', '2018-01-08'],
                                        'test': ['2018-01-08', '2018-01-10']}
        self.raw['p1']['calibration'].update(minimum_days=2, minimum_slots=100)
        self.raw['p1']['quantile_model'].update(max_iter=3, min_samples_leaf=2, max_leaf_nodes=3)
        self.config = self.root / 'config.json'
        ts = pd.date_range('2018-01-01', periods=9 * 96, freq='15min', tz='UTC')
        self.electric = pd.concat([pd.DataFrame({
            'dataid': hid, 'local_15min': ts.astype(str),
            'air1': scale * (2 + np.sin(np.arange(len(ts)) * np.pi / 48)),
            'air2': np.nan, 'airwindowunit1': np.nan,
        }) for hid, scale in [(999991, 1.), (999992, 2.)]], ignore_index=True)
        hours = pd.date_range('2018-01-01', periods=9 * 24, freq='h')
        self.weather = pd.DataFrame({'time': hours.astype(str),
                                     'temperature_2m (°C)': 20 + np.sin(np.arange(len(hours)) * np.pi / 12)})
        self.write()

    def write(self):
        self.config.write_text(json.dumps(self.raw))
        self.electric.to_csv(self.data / self.raw['files']['electric_15m'], index=False)
        (self.data / self.raw['files']['weather']).write_text(
            'timezone,utc_offset_seconds\nGMT,0\n\n' + self.weather.to_csv(index=False))

    def run_comparison(self):
        return run_comparison(load_config(self.config), self.data)

    def test_multi_household_same_population_reproducible_and_test_isolation(self):
        before = self.run_comparison()
        again = self.run_comparison()
        pd.testing.assert_frame_equal(before.predictions, again.predictions)
        self.assertEqual(before.report, again.report)
        self.assertEqual(before.report['candidate_household_ids'], [999991, 999992])
        self.assertEqual(set(before.predictions['split']), {'calibration', 'development'})
        self.assertTrue(all(h['calibration']['B0']['status'] == 'calibrated' for h in before.report['households']))
        future = self.electric['local_15min'].ge('2018-01-08')
        self.electric.loc[future, 'air1'] = -1e9
        self.electric.loc[future, 'air2'] = 200.
        self.weather.loc[self.weather['time'].ge('2018-01-08'), 'temperature_2m (°C)'] = 999.
        self.write()
        after = self.run_comparison()
        pd.testing.assert_frame_equal(before.predictions, after.predictions)
        self.assertEqual(before.report['comparison'], after.report['comparison'])
        self.assertEqual(before.report['households'], after.report['households'])

    def test_development_cannot_change_fit_or_calibration(self):
        before = self.run_comparison()
        dev = self.electric['local_15min'].ge('2018-01-06') & self.electric['local_15min'].lt('2018-01-08')
        self.electric.loc[dev, 'air1'] *= 10
        self.write()
        after = self.run_comparison()
        for first, last in zip(before.report['households'], after.report['households'], strict=True):
            self.assertEqual(first['B0_parameters'], last['B0_parameters'])
            self.assertEqual(first['calibration'], last['calibration'])
        pd.testing.assert_frame_equal(before.predictions[['q05', 'q50', 'q95', 'lower', 'upper']],
                                      after.predictions[['q05', 'q50', 'q95', 'lower', 'upper']])
        self.assertNotEqual(before.report['comparison'], after.report['comparison'])

    def test_calibration_changes_bounds_not_training_quantiles(self):
        before = self.run_comparison()
        cal = self.electric['local_15min'].ge('2018-01-04') & self.electric['local_15min'].lt('2018-01-06')
        self.electric.loc[cal, 'air1'] *= 10
        self.write()
        after = self.run_comparison()
        pd.testing.assert_frame_equal(before.predictions[['q05', 'q50', 'q95']],
                                      after.predictions[['q05', 'q50', 'q95']])
        self.assertNotEqual(before.report['households'][0]['calibration'], after.report['households'][0]['calibration'])

    def test_report_records_the_calibration_method_and_both_corrections(self):
        result = self.run_comparison()
        self.assertEqual(result.report['protocol']['protocol_version'], 'p1-v3')
        self.assertEqual(result.report['protocol']['calibration']['method'], 'asymmetric')
        for household in result.report['households']:
            for model in ('B0', 'B1'):
                profile = household['calibration'][model]
                self.assertEqual(profile['method'], 'asymmetric')
                self.assertEqual(profile['status'], 'calibrated')
                self.assertIsNone(profile['qhat'])
                # The predictions carry exactly the band built from the two recorded corrections.
                rows = result.predictions.loc[result.predictions['household_id'].eq(household['household_id'])
                                              & result.predictions['model'].eq(model)]
                expected_lower = (rows['q05'] - profile['qhat_lower']).clip(lower=0)
                expected_upper = rows['q95'] + profile['qhat_upper']
                np.testing.assert_array_equal(rows['lower'].to_numpy(), expected_lower.to_numpy())
                np.testing.assert_array_equal(rows['upper'].to_numpy(), expected_upper.to_numpy())

    def test_calibration_method_changes_only_the_bounds(self):
        asymmetric = self.run_comparison()
        self.raw['p1']['calibration']['method'] = 'symmetric'
        self.write()
        symmetric = self.run_comparison()
        # Same output columns; only lower and upper may differ (the detector reads these files).
        columns = list(asymmetric.predictions.columns)
        self.assertEqual(columns, list(symmetric.predictions.columns))
        unchanged = [column for column in columns if column not in ('lower', 'upper')]
        pd.testing.assert_frame_equal(asymmetric.predictions[unchanged], symmetric.predictions[unchanged])
        pd.testing.assert_frame_equal(asymmetric.daily, symmetric.daily)
        for household in symmetric.report['households']:
            for model in ('B0', 'B1'):
                profile = household['calibration'][model]
                self.assertEqual(profile['method'], 'symmetric')
                self.assertEqual(profile['qhat_lower'], profile['qhat'])
                self.assertEqual(profile['qhat_upper'], profile['qhat'])

    def test_pending_profiles_keep_households_and_null_bounds(self):
        self.raw['p1']['calibration']['minimum_days'] = 3
        self.write()
        result = self.run_comparison()
        self.assertEqual(len(result.report['households']), 2)
        self.assertTrue(result.predictions[['lower', 'upper']].isna().all().all())
        self.assertEqual(result.report['comparison']['comparison_status'], 'incomplete_calibration_or_daily_support')
        self.assertEqual(result.report['comparison']['recommendation'], 'insufficient_evidence')

    def test_no_daily_training_support_keeps_pending_household(self):
        self.electric.loc[self.electric['dataid'].eq(999991), 'air1'] = 2.
        self.write()
        result = self.run_comparison()
        self.assertEqual(result.report['candidate_household_ids'], [999991, 999992])
        self.assertEqual(result.report['households'][0]['training_rows'], 0)
        selected = result.predictions.loc[result.predictions['household_id'].eq(999991)]
        self.assertTrue(selected['prediction_status'].eq('training_pending').all())
        self.assertTrue(selected[['lower', 'upper']].isna().all().all())

    def test_cli_outputs_hashes_no_overwrite_or_test_option(self):
        out = self.root / 'run'
        command = [sys.executable, '-m', 'silentwatt_ml', 'compare', '--config', str(self.config),
                   '--data-dir', str(self.data), '--output-dir', str(out)]
        sources = {p: sha256_file(p) for p in self.data.iterdir()}
        subprocess.run(command, capture_output=True, text=True, check=True)
        report = json.loads((out / 'report.json').read_text())
        for name, digest in report['artifact_sha256'].items():
            self.assertEqual(sha256_file(out / name), digest)
        repeated = self.root / 'repeat'
        subprocess.run(command[:-1] + [str(repeated)], capture_output=True, text=True, check=True)
        for path in out.iterdir():
            self.assertEqual(path.read_bytes(), (repeated / path.name).read_bytes(), path.name)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertNotEqual(subprocess.run(command + ['--evaluation-split', 'test'], capture_output=True).returncode, 0)
        forbidden = command[:-1] + [str(self.data / 'output')]
        self.assertNotEqual(subprocess.run(forbidden, capture_output=True).returncode, 0)
        self.assertEqual(sources, {p: sha256_file(p) for p in self.data.iterdir()})

    def test_invalid_p1_settings_rejected(self):
        self.raw['p1']['daily_quality']['frozen_run_slots'] = 1
        self.write()
        with self.assertRaises(ValueError):
            load_config(self.config)

    def test_local_split_boundary_is_converted_to_utc_grid(self):
        self.raw['display_timezone'] = 'America/Chicago'
        self.raw['analysis_window_utc'] = {'start': '2018-01-01T06:00:00Z', 'end': '2018-01-10T06:00:00Z'}
        self.electric['local_15min'] = (
            pd.to_datetime(self.electric['local_15min'], utc=True) + pd.Timedelta(hours=6)).astype(str)
        self.weather['time'] = (pd.to_datetime(self.weather['time']) + pd.Timedelta(hours=6)).astype(str)
        self.write()
        result = self.run_comparison()
        self.assertEqual(result.predictions['ts_utc'].max(), pd.Timestamp('2018-01-08T05:45:00Z'))
        self.assertEqual(set(result.daily['expected_slots']), {96})
