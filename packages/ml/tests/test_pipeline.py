"""Small, explicitly synthetic scenarios; never read the private Austin files."""
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
from silentwatt_ml.data.audit import build_audit
from silentwatt_ml.data.quality import electric_timestamps, weather_frame
from silentwatt_ml.data.readers import sha256_file
from silentwatt_ml.models.baseline import run_baseline


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "dataset"
        self.data.mkdir()
        template = Path(__file__).resolve().parents[3] / "configs/ml/austin-2018.json"
        self.raw = json.loads(template.read_text())
        self.raw["display_timezone"] = "UTC"
        self.raw["analysis_window_utc"] = {"start": "2018-01-01T00:00:00Z", "end": "2018-01-05T00:00:00Z"}
        self.raw["splits_local_date"] = {
            name: [f"2018-01-0{i}", f"2018-01-0{i + 1}"]
            for i, name in enumerate(("train", "calibration", "development", "test"), start=1)
        }
        self.raw["baseline"].update(minimum_hour_temperature_samples=2, minimum_temperature_samples=4)
        self.config_path = self.root / "config.json"
        self.electric = pd.DataFrame({
            "dataid": 999999,
            "local_15min": pd.date_range("2018-01-01", periods=384, freq="15min", tz="UTC").astype(str),
            "air1": 1.0, "air2": np.nan, "airwindowunit1": np.nan,
        })
        self.weather = pd.DataFrame({
            "time": pd.date_range("2018-01-01", periods=96, freq="h").astype(str),
            "temperature_2m (°C)": 20.0,
        })
        self.write_sources()

    def write_sources(self):
        self.config_path.write_text(json.dumps(self.raw))
        self.electric.to_csv(self.data / self.raw["files"]["electric_15m"], index=False)
        self.electric.iloc[:1].rename(columns={"local_15min": "localminute"}).to_csv(
            self.data / self.raw["files"]["electric_1m"], index=False)
        path = self.data / self.raw["files"]["weather"]
        path.write_text("latitude,longitude,timezone,utc_offset_seconds\n30,-97,GMT,0\n\n" + self.weather.to_csv(index=False))

    def run_model(self, **kwargs):
        return run_baseline(load_config(self.config_path), self.data, 999999, **kwargs)

    def test_default_development_and_known_metrics(self):
        result = self.run_model()
        self.assertEqual(result.metrics.evaluation_split, "development")
        self.assertEqual(result.metrics.scored_rows, 96)
        self.assertEqual(set(result.predictions.local_date), {"2018-01-03"})
        self.assertEqual(result.metrics.mae_median, 0)
        self.assertEqual(result.metrics.interval_coverage, 1)
        self.assertEqual(result.metrics.mean_interval_width, 0)
        self.assertTrue((result.predictions.q05 <= result.predictions.q50).all())
        self.assertTrue((result.predictions.q50 <= result.predictions.q95).all())
        self.assertEqual(result.metadata["provenance"]["config"], self.raw)

    def test_held_out_targets_never_fit_quantiles(self):
        before = self.run_model()
        self.electric.loc[96:, "air1"] = 1000.0
        self.write_sources()
        after = self.run_model()
        pd.testing.assert_frame_equal(before.predictions[["q05", "q50", "q95"]], after.predictions[["q05", "q50", "q95"]])
        self.assertEqual(before.metadata["model_parameters"], after.metadata["model_parameters"])
        self.assertEqual(after.metrics.mae_median, 999)
        self.assertEqual(after.metrics.interval_coverage, 0)

    def test_locked_test_requires_explicit_access(self):
        with self.assertRaisesRegex(ValueError, "Locked test"):
            self.run_model(evaluation_split="test")
        result = self.run_model(evaluation_split="test", allow_test=True)
        self.assertEqual(set(result.predictions.local_date), {"2018-01-04"})
        with self.assertRaisesRegex(ValueError, "Evaluation must"):
            self.run_model(evaluation_split="calibration")

    def test_missing_invalid_and_unsupported_slots_stay_visible(self):
        self.electric = self.electric.drop(index=192)
        self.electric.loc[193, "air1"] = -1
        self.electric.loc[194, "air1"] = np.inf
        self.weather = self.weather.drop(index=49)
        self.weather.loc[50, "temperature_2m (°C)"] = 35
        self.write_sources()
        result = self.run_model()
        self.assertEqual(result.metrics.evaluation_slots, 96)
        self.assertEqual(result.metrics.missing_target_slots, 3)
        self.assertEqual(result.metrics.missing_weather_slots, 4)
        self.assertEqual(result.metrics.out_of_support_rows, 4)
        self.assertEqual(result.metrics.scored_rows, 85)
        invalid = result.predictions.query("prediction_status != 'ok'")
        self.assertTrue(invalid.q50.isna().all())

    def test_duplicate_electricity_rejected_and_audit_coverage_not_inflated(self):
        self.electric = pd.concat([self.electric, self.electric.iloc[:1]], ignore_index=True)
        self.write_sources()
        with self.assertRaisesRegex(ValueError, "Duplicate electricity"):
            self.run_model()
        report = build_audit(load_config(self.config_path), self.data)
        household = report["households"][0]
        self.assertAlmostEqual(household["training_valid_target_coverage"], 95 / 96)
        self.assertIn("duplicate_training_keys", household["exclusion_reasons"])
        self.assertEqual(report["candidate_household_ids"], [])

    def test_audit_ignores_future_for_cohort_and_invalid_slots_for_coverage(self):
        self.electric.loc[96:, "air2"] = 2.0
        self.electric.loc[0, "air1"] = -1
        self.electric.loc[1, "local_15min"] = "2017-12-31T23:00:00Z"
        self.electric.loc[2, "local_15min"] = "2018-01-01T00:30:01Z"
        self.write_sources()
        report = build_audit(load_config(self.config_path), self.data)
        self.assertEqual(report["candidate_household_ids"], [999999])
        self.assertAlmostEqual(report["households"][0]["training_valid_target_coverage"], 93 / 96)
        self.assertLessEqual(report["households"][0]["annual_valid_target_coverage"], 1)

    def test_weather_conflicting_keys_and_unknown_timezone_are_rejected(self):
        self.weather = pd.concat([self.weather, self.weather.iloc[:1]], ignore_index=True)
        self.write_sources()
        with self.assertRaisesRegex(ValueError, "valid, unique"):
            self.run_model()
        path = self.data / self.raw["files"]["weather"]
        path.write_text(path.read_text().replace("GMT,0", "America/Chicago,-21600"))
        with self.assertRaisesRegex(ValueError, "UTC/GMT"):
            weather_frame(path, load_config(self.config_path))

    def test_dst_offsets_and_naive_timestamps(self):
        ts = electric_timestamps(pd.Series(["2018-11-04 01:15:00-05", "2018-11-04 01:15:00-06:00", "2018-11-04 01:15:00"]))
        # Pecan exports abbreviated -05/-06 offsets; both forms are explicit.
        self.assertEqual(ts.iloc[1] - ts.iloc[0], pd.Timedelta(hours=1))
        self.assertTrue(pd.isna(ts.iloc[2]))
        ts = electric_timestamps(pd.Series(["2018-11-04 01:15:00-05:00", "2018-11-04 01:15:00-06:00"]))
        self.assertEqual(ts.iloc[1] - ts.iloc[0], pd.Timedelta(hours=1))

    def test_config_rejects_overlap_and_ignored_parameters(self):
        for edit in ("overlap", "quantiles", "width", "path"):
            with self.subTest(edit=edit):
                raw = json.loads(self.config_path.read_text())
                if edit == "overlap":
                    raw["splits_local_date"]["test"] = raw["splits_local_date"]["train"]
                elif edit == "quantiles":
                    raw["baseline"]["quantiles"] = [0.1, 0.5, 0.9]
                elif edit == "width":
                    raw["baseline"]["temperature_bin_c"] = 0
                else:
                    raw["files"]["weather"] = "../outside.csv"
                candidate = self.root / f"{edit}.json"
                candidate.write_text(json.dumps(raw))
                with self.assertRaises(ValueError):
                    load_config(candidate)

    def test_baseline_does_not_require_unused_one_minute_file(self):
        (self.data / self.raw["files"]["electric_1m"]).unlink()
        self.assertEqual(self.run_model().metrics.scored_rows, 96)

    def test_one_minute_duplicate_keys_are_counted_exactly(self):
        path = self.data / self.raw["files"]["electric_1m"]
        minute = pd.read_csv(path)
        later = minute.copy()
        later["localminute"] = "2018-01-01T00:00:30Z"
        pd.concat([minute, minute, later]).to_csv(path, index=False)
        report = build_audit(load_config(self.config_path), self.data)
        self.assertEqual(report["electric_1m"]["duplicate_household_timestamp_keys"], 1)
        self.assertEqual(report["electric_1m"]["off_grid_rows"], 1)

    def test_dst_training_denominator_uses_elapsed_slots(self):
        self.raw["display_timezone"] = "America/Chicago"
        self.raw["analysis_window_utc"] = {"start": "2018-03-11T06:00:00Z", "end": "2018-03-15T05:00:00Z"}
        self.raw["splits_local_date"] = {
            name: [f"2018-03-{day}", f"2018-03-{day + 1}"]
            for day, name in enumerate(("train", "calibration", "development", "test"), start=11)
        }
        self.electric["local_15min"] = pd.date_range("2018-03-11T06:00:00Z", periods=384, freq="15min").astype(str)
        self.write_sources()
        report = build_audit(load_config(self.config_path), self.data)
        self.assertEqual(report["electric_15m"]["expected_training_slots_per_household"], 92)
        self.assertEqual(report["households"][0]["training_valid_target_coverage"], 1.0)

    def test_cli_reproducible_artifacts_and_read_only_sources(self):
        hashes = {path.name: sha256_file(path) for path in self.data.iterdir()}
        command = [sys.executable, "-m", "silentwatt_ml", "baseline", "--data-dir", str(self.data),
                   "--config", str(self.config_path), "--household-id", "999999", "--output-dir"]
        output = self.root / "run"
        completed = subprocess.run([*command, str(output)], capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        metrics = json.loads((output / "metrics.json").read_text())
        self.assertIn("package_source_sha256", metrics["metadata"]["provenance"])
        second = self.root / "second-run"
        repeated = subprocess.run([*command, str(second)], capture_output=True, text=True)
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertEqual((output / "metrics.json").read_bytes(), (second / "metrics.json").read_bytes())
        self.assertEqual((output / "predictions.csv").read_bytes(), (second / "predictions.csv").read_bytes())
        self.assertNotEqual(subprocess.run([*command, str(output)], capture_output=True).returncode, 0)
        self.assertNotEqual(subprocess.run([*command, str(self.data / "bad-output")], capture_output=True).returncode, 0)
        self.assertEqual(hashes, {path.name: sha256_file(path) for path in self.data.iterdir()})
