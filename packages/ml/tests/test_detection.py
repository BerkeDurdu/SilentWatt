"""Detector, synthetic scenarios and evidence (MVP). Small, explicitly synthetic scenarios.

The tests never read the private Austin files. Prediction-like tables are built here with
the columns of a P1 predictions.csv and daily-quality.csv.
"""
from __future__ import annotations

import math
import unittest
from datetime import date, timedelta

import numpy as np
import pandas as pd

from silentwatt_ml.detection.daily_stats import add_z, household_daily_table, june_reference
from silentwatt_ml.detection.evidence import SCHEMA_VERSION, build_case, validate_case
from silentwatt_ml.detection.rules import (acute_candidates, chronic_candidates, cusum_series,
                                           data_issue_candidates, merge_into_cases)
from silentwatt_ml.detection.synthetic import inject, requalify

TIMEZONE = "America/Chicago"
DAILY_SETTINGS = {"minimum_coverage": 0.95, "frozen_run_slots": 16, "block_frozen_days": True}
ACUTE = {"z_threshold": 2.0, "exceedance_share_threshold": 0.2, "consecutive_days": 2}
CHRONIC = {"k": 0.5, "h": 5.0, "positive_days": 3, "window_days": 5}
REPLAY_WINDOW = {"split": "development", "start_local_date": "2018-07-01", "end_local_date": "2018-08-01"}


def local_slots(day: date) -> pd.DatetimeIndex:
    """The 96 UTC slots of a summer local day in Austin (local midnight is 05:00 UTC)."""
    start = pd.Timestamp(day.isoformat(), tz=TIMEZONE).tz_convert("UTC")
    return pd.date_range(start, periods=96, freq="15min")


def slot_table(days: list[tuple[date, str]], target, q50=1.0, lower=0.2, upper=1.8) -> pd.DataFrame:
    """Prediction-like rows for one household; target may be a number or f(day, slot_index)."""
    rows = []
    for day, split in days:
        for index, ts in enumerate(local_slots(day)):
            value = target(day, index) if callable(target) else target
            rows.append({"ts_utc": ts, "local_date": day.isoformat(), "split": split, "target": value,
                         "target_quality": "ok", "q50": q50, "lower": lower, "upper": upper,
                         "temperature_c": 30.0, "slot_supported": True, "eligible": True, "day_eligible": True})
    return pd.DataFrame(rows)


def day_table(days: list[tuple[date, str]], reasons: dict[date, str] | None = None) -> pd.DataFrame:
    reasons = reasons or {}
    return pd.DataFrame([{"local_date": day.isoformat(), "split": split, "expected_slots": 96,
                          "valid_joint_slots": 96, "day_eligible": day not in reasons,
                          "reasons": reasons.get(day, "ok")} for day, split in days])


def july(day: int) -> date:
    return date(2018, 7, day)


def daily_rows(z_values: list, shares: list | None = None) -> pd.DataFrame:
    """A development daily table from z values; None marks a day that could not be scored."""
    shares = shares or [0.5 if z is not None else None for z in z_values]
    rows = []
    for offset, (z, share) in enumerate(zip(z_values, shares)):
        scored = z is not None
        rows.append({"local_date": (july(4) + timedelta(days=offset)).isoformat(), "split": "development",
                     "scored": scored, "not_scored_reason": None if scored else "temperature_out_of_support",
                     "z": z if scored else np.nan, "upper_exceedance_share": share if scored else np.nan})
    return pd.DataFrame(rows)


class DailyTableTests(unittest.TestCase):
    def test_sums_and_upper_exceedance_share(self):
        days = [(july(4), "development")]
        slots = slot_table(days, lambda day, index: 1.5 if index < 48 else 0.5, q50=1.0, upper=1.4)
        table = household_daily_table(slots, day_table(days), excess_reference_floor=0.3)
        row = table.iloc[0]
        self.assertTrue(row["scored"])
        self.assertAlmostEqual(row["observed_unit_hours"], 24.0)
        self.assertAlmostEqual(row["reference_unit_hours"], 24.0)
        self.assertAlmostEqual(row["residual_unit_hours"], 0.0)
        self.assertAlmostEqual(row["excess_share"], 0.0)
        self.assertAlmostEqual(row["upper_exceedance_share"], 0.5)
        self.assertEqual(row["valid_slots"], 96)

    def test_a_day_that_failed_the_gate_keeps_nulls_and_its_reason(self):
        days = [(july(4), "development")]
        table = household_daily_table(slot_table(days, 1.0), day_table(days, {july(4): "temperature_out_of_support"}),
                                      excess_reference_floor=0.3)
        row = table.iloc[0]
        self.assertFalse(row["scored"])
        self.assertEqual(row["not_scored_reason"], "temperature_out_of_support")
        self.assertTrue(math.isnan(row["observed_unit_hours"]))
        self.assertTrue(math.isnan(row["excess_share"]))

    def test_excess_share_is_null_when_the_reference_is_below_the_floor(self):
        days = [(july(4), "development")]
        table = household_daily_table(slot_table(days, 0.002, q50=0.001), day_table(days), excess_reference_floor=0.3)
        self.assertTrue(math.isnan(table.iloc[0]["excess_share"]))


class JuneReferenceTests(unittest.TestCase):
    def june_table(self, residuals):
        return pd.DataFrame({"split": "calibration", "scored": True, "residual_unit_hours": residuals})

    def test_median_and_mad_scale(self):
        reference = june_reference(self.june_table([-2.0, -1.0, 0.0, 1.0, 2.0] * 3), minimum_days=14, scale_floor=0.024)
        self.assertAlmostEqual(reference["median"], 0.0)
        self.assertAlmostEqual(reference["scale"], 1.4826 * 1.0)
        self.assertEqual(reference["days"], 15)

    def test_constant_residuals_use_the_scale_floor(self):
        reference = june_reference(self.june_table([0.5] * 20), minimum_days=14, scale_floor=0.024)
        self.assertAlmostEqual(reference["scale"], 0.024)

    def test_too_few_june_days_publish_no_reference(self):
        self.assertIsNone(june_reference(self.june_table([0.5] * 13), minimum_days=14, scale_floor=0.024))

    def test_z_uses_the_june_reference_and_skips_unscored_days(self):
        table = pd.DataFrame({"scored": [True, False], "residual_unit_hours": [3.0, 9.0]})
        z = add_z(table, {"median": 1.0, "scale": 2.0, "days": 20})["z"]
        self.assertAlmostEqual(z.iloc[0], 1.0)
        self.assertTrue(math.isnan(z.iloc[1]))


class RuleTests(unittest.TestCase):
    def test_acute_needs_consecutive_flagged_days(self):
        candidates = acute_candidates(daily_rows([0.1, 3.0, 3.0, 0.1]), ACUTE, max_gap_days=2)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["onset"], "2018-07-05")
        self.assertEqual(candidates[0]["detected"], "2018-07-06")
        self.assertEqual(candidates[0]["last"], "2018-07-06")
        self.assertEqual(acute_candidates(daily_rows([0.1, 3.0, 0.1, 3.0]), ACUTE, max_gap_days=2), [])

    def test_acute_also_needs_the_upper_exceedance_share(self):
        rows = daily_rows([3.0, 3.0], shares=[0.1, 0.1])
        self.assertEqual(acute_candidates(rows, ACUTE, max_gap_days=2), [])

    def test_acute_run_survives_a_short_gap_but_not_a_long_one(self):
        short_gap = acute_candidates(daily_rows([3.0, None, 3.0]), ACUTE, max_gap_days=2)
        self.assertEqual([(c["onset"], c["detected"]) for c in short_gap], [("2018-07-04", "2018-07-06")])
        self.assertEqual(acute_candidates(daily_rows([3.0, None, None, None, 3.0]), ACUTE, max_gap_days=2), [])

    def test_cusum_accumulates_freezes_over_short_gaps_and_resets_after_long_ones(self):
        statistic = cusum_series(daily_rows([3.0, 3.0, None, 3.0]), CHRONIC, max_gap_days=2)
        self.assertEqual([round(v, 2) for v in statistic.fillna(-1)], [2.5, 5.0, -1, 7.5])
        statistic = cusum_series(daily_rows([3.0, 3.0, None, None, None, 3.0]), CHRONIC, max_gap_days=2)
        self.assertAlmostEqual(statistic.iloc[-1], 2.5)

    def test_chronic_candidate_needs_the_threshold_and_enough_positive_days(self):
        rows = daily_rows([3.0, 3.0, None, 3.0])
        candidates = chronic_candidates(rows, cusum_series(rows, CHRONIC, max_gap_days=2), CHRONIC, max_gap_days=2)
        self.assertEqual([(c["onset"], c["detected"], c["last"]) for c in candidates],
                         [("2018-07-04", "2018-07-07", "2018-07-07")])
        rows = daily_rows([1.0, 1.0, 1.0, 1.0])
        self.assertEqual(chronic_candidates(rows, cusum_series(rows, CHRONIC, max_gap_days=2), CHRONIC,
                                            max_gap_days=2), [])

    def test_data_issue_needs_consecutive_coverage_or_freeze_days(self):
        def rows(reasons):
            return pd.DataFrame([{"local_date": (july(4) + timedelta(days=i)).isoformat(), "split": "development",
                                  "scored": reason is None, "not_scored_reason": reason}
                                 for i, reason in enumerate(reasons)])
        found = data_issue_candidates(rows(["insufficient_daily_coverage", "frozen_suspected", None]),
                                      {"consecutive_days": 2})
        self.assertEqual([(c["onset"], c["detected"], c["last"]) for c in found], [("2018-07-04", "2018-07-05", "2018-07-05")])
        self.assertEqual(data_issue_candidates(rows(["temperature_out_of_support"] * 3), {"consecutive_days": 2}), [])
        self.assertEqual(data_issue_candidates(rows(["insufficient_daily_coverage", None, "frozen_suspected"]),
                                               {"consecutive_days": 2}), [])

    def test_overlapping_acute_and_chronic_candidates_become_one_case(self):
        acute = [{"detector": "acute", "onset": "2018-07-05", "detected": "2018-07-06", "last": "2018-07-07"}]
        chronic = [{"detector": "chronic", "onset": "2018-07-06", "detected": "2018-07-09", "last": "2018-07-10"}]
        cases = merge_into_cases(acute, chronic, [])
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0]["detectors"], ["acute", "chronic"])
        self.assertEqual((cases[0]["onset"], cases[0]["detected"], cases[0]["last"]),
                         ("2018-07-05", "2018-07-06", "2018-07-10"))
        self.assertEqual(cases[0]["kind"], "consumption_deviation")


class SyntheticTests(unittest.TestCase):
    def july_slots(self):
        days = [(july(d), "development") for d in range(1, 32)]
        # Unit running (1.0) in the afternoon, off (0.0) otherwise.
        return slot_table(days, lambda day, index: 1.0 if 56 <= index < 80 else 0.0)

    def scenario(self, **values):
        return {"scenario": "step_increase", "fault_kind": None, "severity": 0.2, "duration_days": 7,
                "start_local_date": "2018-07-04", **values}

    def test_step_raises_only_running_slots_inside_the_window(self):
        original = self.july_slots()
        injected = inject(original, self.scenario(), running_threshold=0.3)
        inside = injected["local_date"].between("2018-07-04", "2018-07-10")
        running = original["target"] > 0.3
        np.testing.assert_allclose(injected.loc[inside & running, "target"], 1.2)
        np.testing.assert_allclose(injected.loc[inside & ~running, "target"], 0.0)
        pd.testing.assert_series_equal(injected.loc[~inside, "target"], original.loc[~inside, "target"])

    def test_ramp_grows_from_one_to_one_plus_severity(self):
        injected = inject(self.july_slots(), self.scenario(scenario="ramp_increase", severity=0.3), running_threshold=0.3)
        window = injected[injected["local_date"].between("2018-07-04", "2018-07-10") & (injected["target"] > 0.3)]
        # The first running slot is at 14:00 on the first day, about 8 percent into the window.
        self.assertLess(window["target"].iloc[0], 1.03)
        self.assertGreater(window["target"].iloc[-1], 1.29)
        self.assertLessEqual(window["target"].max(), 1.3 + 1e-9)

    def test_outage_removes_every_reading_of_the_window(self):
        injected = inject(self.july_slots(), self.scenario(scenario="data_fault", fault_kind="outage", severity=None,
                                                           duration_days=3), running_threshold=0.3)
        inside = injected["local_date"].between("2018-07-04", "2018-07-06")
        self.assertTrue(injected.loc[inside, "target"].isna().all())
        self.assertFalse(injected.loc[~inside, "target"].isna().any())

    def test_freeze_repeats_one_positive_value(self):
        injected = inject(self.july_slots(), self.scenario(scenario="data_fault", fault_kind="freeze", severity=None,
                                                           duration_days=3), running_threshold=0.3)
        window = injected.loc[injected["local_date"].between("2018-07-04", "2018-07-06"), "target"]
        self.assertEqual(window.nunique(), 1)
        self.assertGreater(window.iloc[0], 0.3)

    def test_spike_changes_four_slots_per_day(self):
        original = self.july_slots()
        injected = inject(original, self.scenario(scenario="data_fault", fault_kind="spike", severity=None,
                                                  duration_days=3), running_threshold=0.3)
        changed = injected["target"].ne(original["target"])
        self.assertEqual(int(changed.sum()), 12)
        self.assertTrue(changed[injected["local_date"].between("2018-07-04", "2018-07-06")].sum() == 12)

    def test_a_window_outside_the_replay_month_is_refused(self):
        with self.assertRaisesRegex(ValueError, "replay window"):
            inject(self.july_slots(), self.scenario(start_local_date="2018-07-28", duration_days=7), running_threshold=0.3)

    def test_requalify_turns_outage_and_freeze_days_into_data_issues(self):
        original = self.july_slots()
        outage = inject(original, self.scenario(scenario="data_fault", fault_kind="outage", severity=None, duration_days=3),
                        running_threshold=0.3)
        slots, days = requalify(outage, temperature_range=(0.0, 45.0), timezone=TIMEZONE, daily_settings=DAILY_SETTINGS)
        window_days = days[days["local_date"].between("2018-07-04", "2018-07-06")]
        self.assertTrue(window_days["reasons"].str.contains("insufficient_daily_coverage").all())
        self.assertFalse(slots.loc[slots["local_date"].eq("2018-07-05"), "eligible"].any())
        freeze = inject(original, self.scenario(scenario="data_fault", fault_kind="freeze", severity=None, duration_days=3),
                        running_threshold=0.3)
        _, days = requalify(freeze, temperature_range=(0.0, 45.0), timezone=TIMEZONE, daily_settings=DAILY_SETTINGS)
        self.assertTrue(days[days["local_date"].between("2018-07-04", "2018-07-06")]["reasons"]
                        .str.contains("frozen_suspected").all())


class EvidenceTests(unittest.TestCase):
    def detection(self):
        days = [(july(d), "development") for d in range(4, 8)]
        slots = slot_table(days, 2.0, q50=1.0, upper=1.5)
        table = household_daily_table(slots, day_table(days), excess_reference_floor=0.3)
        table["z"] = 3.0
        table["cusum"] = np.nan
        table["flagged"] = True
        case = {"kind": "consumption_deviation", "detectors": ["acute"], "onset": "2018-07-04",
                "detected": "2018-07-05", "last": "2018-07-07"}
        return slots, table, case

    def build(self, **overrides):
        slots, table, case = self.detection()
        arguments = dict(household_id=661, case=case, daily_table=table, slots=slots, origin="observed",
                         synthetic=None, rank=1, priority=1, replay_window=REPLAY_WINDOW,
                         excess_reference_floor=0.3)
        arguments.update(overrides)
        return build_case(**arguments)

    def test_built_case_follows_the_contract(self):
        case = self.build()
        self.assertEqual(case["schema_version"], SCHEMA_VERSION)
        self.assertEqual(case["case_id"], "SW-HVAC-0661-20180704-ACU")
        self.assertEqual(case["recommendation"]["code"], "HVAC_PERSISTENT_INCREASE")
        self.assertAlmostEqual(case["excess_share"], 1.0)
        self.assertEqual(validate_case(case, REPLAY_WINDOW), [])

    def test_synthetic_cases_get_their_own_prefix(self):
        synthetic = {"scenario": "step_increase", "fault_kind": None, "severity": 0.2, "duration_days": 7,
                     "start_local_date": "2018-07-04", "seed": 1, "generator_version": "synthetic-0.1"}
        case = self.build(origin="synthetic", synthetic=synthetic)
        self.assertTrue(case["case_id"].startswith("SW-SYN-HVAC-"))
        self.assertEqual(validate_case(case, REPLAY_WINDOW), [])

    def test_validator_rejects_test_period_dates_and_unknown_schema(self):
        case = self.build()
        case["daily"][0]["local_date"] = "2018-08-02"
        self.assertTrue(any("replay window" in error for error in validate_case(case, REPLAY_WINDOW)))
        case = self.build()
        case["schema_version"] = "silentwatt.evidence/9.0"
        self.assertTrue(any("schema_version" in error for error in validate_case(case, REPLAY_WINDOW)))

    def test_missing_values_stay_null(self):
        case = self.build()
        self.assertTrue(all(row["cusum"] is None for row in case["daily"]))


if __name__ == "__main__":
    unittest.main()
