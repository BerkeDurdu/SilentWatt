"""The detector run's own pieces: p1-v3 calibration, solar shortfall, thresholds, June level, peers."""
from __future__ import annotations

import unittest
from datetime import date, timedelta

import numpy as np
import pandas as pd

from silentwatt_ml.detection.daily_stats import household_daily_table
from silentwatt_ml.detection.evidence import rank_and_prioritize
from silentwatt_ml.detection.pipeline import (
    HouseholdRun, _cases_for, choose_thresholds, june_level, peer_adjust, rules_view,
)
from silentwatt_ml.detection.synthetic import inject
from silentwatt_ml.models.calibration import apply_calibration, calibrate_asymmetric

from test_detection import day_table, july, slot_table

SETTINGS = {"excess_reference_floor": 1.0, "minimum_peers": 2}
DETECTOR = {
    "alarm_budget_per_family_month": {"acute": 1, "chronic": 1, "total": 2},
    "max_gap_days": 2, "june_minimum_days": 3,
    "grid": {"acute": {"z_threshold": [1.0, 2.0, 3.0], "exceedance_share_threshold": [0.1], "consecutive_days": [2]},
             "chronic": {"h": [2.0, 50.0], "k": [0.5], "positive_days": 3, "window_days": 5}},
    "data_issue": {"consecutive_days": 2},
}


def june(day: int) -> date:
    return date(2018, 6, day)


class AsymmetricCalibrationTests(unittest.TestCase):
    def test_each_side_gets_its_own_margin_and_none_shrinks(self):
        rows = 400
        frame = pd.DataFrame({
            "target": np.r_[np.full(rows - 40, 1.0), np.full(40, 3.0)],   # misses only above the band
            "q05": 0.8, "q50": 1.0, "q95": 1.2, "eligible": True,
            "local_date": [f"2018-06-{1 + i % 20:02d}" for i in range(rows)],
        })
        profile = calibrate_asymmetric(frame, {"alpha": 0.1, "minimum_days": 14, "minimum_slots": 100})
        self.assertEqual(profile["status"], "calibrated")
        self.assertEqual(profile["qhat_lower"], 0.0)
        self.assertAlmostEqual(profile["qhat_upper"], 1.8)
        banded = apply_calibration(frame, profile)
        self.assertAlmostEqual(float(banded["lower"].iloc[0]), 0.8)
        self.assertAlmostEqual(float(banded["upper"].iloc[0]), 3.0)

    def test_too_little_june_stays_pending(self):
        frame = pd.DataFrame({"target": [1.0], "q05": [0.8], "q50": [1.0], "q95": [1.2], "eligible": [True],
                              "local_date": ["2018-06-01"]})
        self.assertEqual(calibrate_asymmetric(frame, {"alpha": 0.1, "minimum_days": 14, "minimum_slots": 100})["status"],
                         "calibration_pending")


class SolarTests(unittest.TestCase):
    def test_production_drop_lowers_every_reading_of_the_window(self):
        days = [(july(d), "development") for d in range(4, 12)]
        slots = slot_table(days, 2.0)
        scenario = {"scenario": "production_drop", "severity": 0.35, "duration_days": 3, "start_local_date": "2018-07-05"}
        injected = inject(slots, scenario, 0.0)
        inside = injected["local_date"].isin(["2018-07-05", "2018-07-06", "2018-07-07"])
        self.assertTrue(np.allclose(injected.loc[inside, "target"], 1.3))
        self.assertTrue(np.allclose(injected.loc[~inside, "target"], 2.0))

    def test_lower_shortfall_share_counts_readings_under_the_lower_bound(self):
        days = [(july(4), "development")]
        table = household_daily_table(slot_table(days, lambda d, i: 0.1 if i < 24 else 1.0), day_table(days), 0.3)
        self.assertEqual(int(table.loc[0, "lower_shortfall_slots"]), 24)
        self.assertAlmostEqual(float(table.loc[0, "lower_shortfall_share"]), 0.25)

    def test_shortfalls_rank_with_consumption_deviations_by_size(self):
        ordered = rank_and_prioritize([
            {"case_id": "A", "kind": "consumption_deviation", "excess_unit_hours": 5.0, "flagged_days": 3},
            {"case_id": "B", "kind": "production_shortfall", "excess_unit_hours": 9.0, "flagged_days": 3},
            {"case_id": "C", "kind": "data_issue", "excess_unit_hours": None, "flagged_days": 2},
        ])
        self.assertEqual([e["case_id"] for e in ordered], ["B", "A", "C"])
        self.assertEqual(ordered[-1]["priority"], 3)

    def test_rules_read_a_shortfall_as_the_positive_direction(self):
        table = pd.DataFrame({"z": [-3.0], "upper_exceedance_share": [0.0], "lower_shortfall_share": [0.4]})
        view = rules_view(table, "solar")
        self.assertEqual(float(view.loc[0, "z"]), 3.0)
        self.assertEqual(float(view.loc[0, "upper_exceedance_share"]), 0.4)


def june_rows(z_values: list[float]) -> pd.DataFrame:
    return pd.DataFrame([{"local_date": (june(1) + timedelta(days=i)).isoformat(), "split": "calibration",
                          "scored": True, "not_scored_reason": None, "z": z, "upper_exceedance_share": 0.5}
                         for i, z in enumerate(z_values)])


class ThresholdTests(unittest.TestCase):
    def test_the_most_sensitive_point_inside_the_budget_is_chosen(self):
        # Two households: one has a two-day run at z 2.5, the other at z 1.5 twice.
        views = [june_rows([2.5, 2.5, 0, 0, 0, 0]), june_rows([1.5, 1.5, 0, 1.5, 1.5, 0])]
        chosen = choose_thresholds(views, DETECTOR)
        # z 1.0 gives three June cases, z 2.0 gives one: inside the budget of one.
        self.assertEqual(chosen["acute"]["z_threshold"], 2.0)
        self.assertEqual(chosen["june_cases"]["acute"], 1)
        self.assertTrue(chosen["budget_met"])

    def test_a_case_needs_a_meaningful_effect_in_the_family_direction(self):
        table = pd.DataFrame([{"local_date": f"2018-07-{d:02d}", "split": "development", "flagged": True, "scored": True,
                               "observed_unit_hours": 10.5, "reference_unit_hours": 10.0} for d in (4, 5)])
        found = {"cases": [{"kind": "consumption_deviation", "detectors": ["acute"], "onset": "2018-07-04",
                            "detected": "2018-07-05", "last": "2018-07-05"}]}
        run = HouseholdRun(1, "hvac")
        self.assertEqual(_cases_for(run, table, found, "hvac", 0.10), [], "+5% is below the 10% minimum")
        self.assertEqual(len(_cases_for(run, table, found, "hvac", 0.04)), 1)
        self.assertEqual(_cases_for(run, table, found, "solar", 0.04), [], "a solar case must be a shortfall")


def banded_run(household: int, june_value: float, july_value: float, reference: float = 1.0) -> HouseholdRun:
    days = [(june(d), "calibration") for d in range(1, 6)] + [(july(d), "development") for d in range(1, 6)]
    slots = slot_table(days, lambda d, i: june_value if d.month == 6 else july_value, q50=reference,
                       lower=reference * 0.5, upper=reference * 1.5)
    slots["q05"], slots["q95"] = reference * 0.8, reference * 1.2
    run = HouseholdRun(household, "hvac", slots=slots, days=day_table(days), calibration={"status": "calibrated"})
    return run


class AdjustmentTests(unittest.TestCase):
    def test_june_level_brings_the_reference_to_the_device_own_june(self):
        run = banded_run(1, june_value=0.8, july_value=0.8)
        june_level(type("C", (), {"raw": {"detector": {"june_minimum_days": 3}}})(), SETTINGS, {1: run})
        self.assertAlmostEqual(run.details["june_level_factor"], 0.8)
        self.assertTrue(np.allclose(run.slots["q50"], 0.8))

    def test_the_common_shift_of_neighbours_is_removed_and_a_household_own_rise_is_not(self):
        # Every July day, all households run 30% above their reference; household 4 runs 60% above.
        runs = {h: banded_run(h, 1.0, 1.3) for h in (1, 2, 3)}
        runs[4] = banded_run(4, 1.0, 1.6)
        peer_adjust(SETTINGS, runs)
        july_rows = runs[4].slots["local_date"].ge("2018-07-01")
        self.assertTrue(np.allclose(runs[4].slots.loc[july_rows, "q50"], 1.3), "the neighbours' 30% is the common shift")
        self.assertTrue(np.allclose(runs[1].slots.loc[runs[1].slots["local_date"].ge("2018-07-01"), "q50"], 1.3))
        self.assertTrue(np.allclose(runs[4].slots.loc[~july_rows, "q50"], 1.0), "June had no common shift")


if __name__ == "__main__":
    unittest.main()
