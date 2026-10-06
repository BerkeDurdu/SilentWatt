"""Target dead band (D-04, decided 2026-10-06): off-state readings near zero read as 0.

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
from silentwatt_ml.data.daily import daily_quality, freeze_flags
from silentwatt_ml.data.quality import valid_target
from silentwatt_ml.models.baseline import _prepare_frame

DECIDED_DEAD_BAND = 0.01


def quarter_hours(count: int) -> pd.DatetimeIndex:
    return pd.date_range("2018-01-01", periods=count, freq="15min", tz="UTC")


class DeadBandRuleTests(unittest.TestCase):
    def test_readings_inside_the_band_are_off_and_read_as_zero(self):
        readings = pd.Series([-0.02, -0.0101, -0.01, -0.001, 0.0, 0.004, 0.01, 0.0101, 1.5])
        expected = pd.Series([np.nan, np.nan, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0101, 1.5])
        pd.testing.assert_series_equal(valid_target(readings, DECIDED_DEAD_BAND), expected)

    def test_missing_and_invalid_readings_stay_missing(self):
        readings = pd.Series([np.nan, np.inf, -np.inf, "broken"], dtype=object)
        self.assertTrue(valid_target(readings, DECIDED_DEAD_BAND).isna().all())

    def test_zero_dead_band_keeps_the_original_rule(self):
        readings = pd.Series([-0.001, 0.0, 0.001, 2.0])
        expected = pd.Series([np.nan, 0.0, 0.001, 2.0])
        pd.testing.assert_series_equal(valid_target(readings, 0.0), expected)

    def test_off_readings_cannot_start_a_freeze_run(self):
        # A sensor resting at +0.004 repeats the same value for hours while the unit is off.
        resting_sensor = pd.Series([0.004] * 20)
        with_band = pd.DataFrame({"ts_utc": quarter_hours(20),
                                  "target": valid_target(resting_sensor, DECIDED_DEAD_BAND)})
        without_band = pd.DataFrame({"ts_utc": quarter_hours(20),
                                     "target": valid_target(resting_sensor, 0.0)})
        self.assertFalse(freeze_flags(with_band, 16).any())
        self.assertTrue(freeze_flags(without_band, 16).iloc[15:].all())

    def test_constant_running_readings_stay_freeze_suspects(self):
        stuck_reading = pd.DataFrame({"ts_utc": quarter_hours(20),
                                      "target": valid_target(pd.Series([1.234] * 20), DECIDED_DEAD_BAND)})
        flags = freeze_flags(stuck_reading, 16)
        self.assertFalse(flags.iloc[:15].any())
        self.assertTrue(flags.iloc[15:].all())

    def test_daily_quality_counts_dead_band_slots_as_valid(self):
        # One local day with varying running readings and two off-state readings set to 0.
        frame = pd.DataFrame({"ts_utc": quarter_hours(96), "target": 1.0 + np.arange(96) * 0.01,
                              "target_quality": "ok", "temperature_c": 20.0, "local_date": "2018-01-01"})
        frame.loc[[3, 4], "target"] = 0.0
        frame.loc[[3, 4], "target_quality"] = "dead_band"
        settings = {"minimum_coverage": 0.95, "frozen_run_slots": 16, "block_frozen_days": True}
        _, days = daily_quality(frame, "UTC", settings)
        day = days.iloc[0]
        self.assertEqual(day["dead_band_slots"], 2)
        self.assertEqual(day["negative_target_slots"], 0)
        self.assertEqual(day["valid_joint_slots"], 96)
        self.assertTrue(day["day_eligible"])


class DeadBandConfigTests(unittest.TestCase):
    def setUp(self):
        repository = Path(__file__).resolve().parents[3]
        self.raw = json.loads((repository / "configs/ml/austin-2018.json").read_text())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config.json"

    def load(self):
        self.path.write_text(json.dumps(self.raw))
        return load_config(self.path)

    def test_project_config_carries_the_decided_dead_band(self):
        self.assertEqual(self.load().target_dead_band, DECIDED_DEAD_BAND)

    def test_dead_band_must_be_a_finite_non_negative_number(self):
        for bad_value in (-0.01, float("nan"), "0.01", True, None):
            with self.subTest(value=bad_value):
                self.raw["target_dead_band"] = bad_value
                with self.assertRaisesRegex(ValueError, "target_dead_band"):
                    self.load()

    def test_dead_band_is_required(self):
        del self.raw["target_dead_band"]
        with self.assertRaisesRegex(ValueError, "target_dead_band"):
            self.load()

    def test_baseline_frame_labels_dead_band_and_far_negative_readings(self):
        config = self.load()
        times = pd.date_range("2018-01-01T06:00:00Z", periods=5, freq="15min")
        raw = pd.DataFrame({"dataid": 1, "local_15min": times.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "air1": [-0.004, 0.003, -0.5, 0.0, 1.0]})
        weather = pd.DataFrame({
            "weather_ts_utc": pd.date_range("2018-01-01T06:00:00Z", "2019-01-01T05:00:00Z", freq="h"),
            "temperature_c": 20.0,
        })
        frame, quality = _prepare_frame(config, {}, 1, raw=raw, weather=weather)
        rows = frame.set_index("ts_utc").loc[times]
        self.assertEqual(rows["target_quality"].tolist(),
                         ["dead_band", "dead_band", "negative_target", "ok", "ok"])
        self.assertEqual(rows["target"].iloc[[0, 1, 3, 4]].tolist(), [0.0, 0.0, 0.0, 1.0])
        self.assertTrue(math.isnan(rows["target"].iloc[2]))
        self.assertEqual(quality["dead_band_rows"], 2)
        self.assertEqual(quality["invalid_or_missing_target_rows"], 1)


if __name__ == "__main__":
    unittest.main()
