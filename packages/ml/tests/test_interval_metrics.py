"""One-sided bound exceedance and coverage while the unit runs (P1 report metrics).

Small, explicitly synthetic scenarios; never read the private Austin files.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import load_config
from silentwatt_ml.models.evaluation import metrics

RUNNING_THRESHOLD = 0.3


def ten_calibrated_slots() -> pd.DataFrame:
    # Slots 6 and 7 lie above the upper bound, slot 8 below the lower bound.
    # Slots 3 to 8 have target > 0.3, so they count as "running".
    return pd.DataFrame({
        "target": [0.0, 0.0, 0.1, 0.5, 1.0, 1.2, 2.5, 3.0, 0.8, 0.0],
        "q05": 0.0, "q50": 0.5, "q95": 1.5,
        "lower": [0.0, 0.0, 0.1, 0.2, 0.2, 0.2, 0.2, 0.2, 0.9, 0.0],
        "upper": [1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 1.0],
    })


class IntervalMetricTests(unittest.TestCase):
    def test_upper_and_lower_exceedance_split_the_misses_of_the_band(self):
        frame = ten_calibrated_slots()
        result = metrics(frame, pd.Series(True, index=frame.index), RUNNING_THRESHOLD)
        self.assertAlmostEqual(result["upper_exceedance"], 0.2)
        self.assertAlmostEqual(result["lower_exceedance"], 0.1)
        self.assertAlmostEqual(result["calibrated_coverage"], 0.7)
        # Every calibrated slot is inside, above or below the band.
        total = result["calibrated_coverage"] + result["upper_exceedance"] + result["lower_exceedance"]
        self.assertAlmostEqual(total, 1.0)

    def test_coverage_while_running_ignores_off_slots(self):
        frame = ten_calibrated_slots()
        result = metrics(frame, pd.Series(True, index=frame.index), RUNNING_THRESHOLD)
        self.assertEqual(result["running_slots"], 6)
        self.assertAlmostEqual(result["running_calibrated_coverage"], 0.5)

    def test_no_running_slots_leaves_running_coverage_empty(self):
        frame = ten_calibrated_slots()
        frame["target"] = 0.0
        result = metrics(frame, pd.Series(True, index=frame.index), RUNNING_THRESHOLD)
        self.assertEqual(result["running_slots"], 0)
        self.assertIsNone(result["running_calibrated_coverage"])

    def test_uncalibrated_slots_give_no_bound_metrics(self):
        frame = ten_calibrated_slots()
        frame[["lower", "upper"]] = np.nan
        result = metrics(frame, pd.Series(True, index=frame.index), RUNNING_THRESHOLD)
        self.assertEqual(result["calibrated_slots"], 0)
        self.assertIsNone(result["upper_exceedance"])
        self.assertIsNone(result["lower_exceedance"])
        self.assertEqual(result["running_slots"], 0)
        self.assertIsNone(result["running_calibrated_coverage"])


class RunningThresholdConfigTests(unittest.TestCase):
    def setUp(self):
        repository = Path(__file__).resolve().parents[3]
        self.raw = json.loads((repository / "configs/ml/austin-2018.json").read_text())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config.json"

    def load(self):
        self.path.write_text(json.dumps(self.raw))
        return load_config(self.path)

    def test_config_carries_the_running_threshold(self):
        self.assertEqual(self.load().raw["p1"]["evaluation"]["running_threshold"], RUNNING_THRESHOLD)

    def test_running_threshold_must_be_a_finite_positive_number(self):
        for bad_value in (0, -0.3, float("nan"), "0.3", True, None):
            with self.subTest(value=bad_value):
                self.raw["p1"]["evaluation"]["running_threshold"] = bad_value
                with self.assertRaisesRegex(ValueError, "running_threshold"):
                    self.load()

    def test_running_threshold_is_required(self):
        del self.raw["p1"]["evaluation"]
        with self.assertRaisesRegex(ValueError, "Invalid nested config"):
            self.load()


if __name__ == "__main__":
    unittest.main()
