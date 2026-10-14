"""Write the committed evidence fixtures (contract silentwatt.evidence/0.1).

The fixtures let the API and the console be built and tested without the private
Pecan Street files. Every number here is made up: household ids start at 90001 and the
curves are smooth synthetic shapes, not measurements. Rerunning the script gives the
same files byte for byte.

Only the 15-minute readings, the June reference of each household and the daily gate are
made up here. Everything else is computed by the package, exactly as for a real run:
daily statistics (daily_stats), z, the CUSUM and the detector rules (rules), and the case
file with its reasons (evidence.build_case). So the daily rows, the series points and the
reasons of a case cannot contradict each other.

    PYTHONPATH=packages/ml/src .venv/bin/python docs/product/ekler/make_evidence_fixtures.py \
        --output shared/fixtures/evidence
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.detection.daily_stats import add_z, household_daily_table
from silentwatt_ml.detection.evidence import SCHEMA_VERSION, build_case, rank_and_prioritize, summary_of
from silentwatt_ml.detection.rules import (acute_candidates, acute_day_flags, chronic_candidates, cusum_series,
                                           data_issue_candidates, merge_into_cases)

JULY_DAYS = [date(2018, 7, 1) + timedelta(days=offset) for offset in range(31)]
REPLAY_WINDOW = {"split": "development", "start_local_date": "2018-07-01", "end_local_date": "2018-08-01"}
# Hourly temperature shape of a made-up hot month; days 13-20 are too hot to score.
TOO_HOT_DAYS = {date(2018, 7, day) for day in range(13, 21)}
SLOTS_PER_DAY = 96
# Illustrative detector settings, not evaluated and not the thresholds of a real run. The
# chronic k and h are chosen so that a short acute run does not also open a chronic case.
DETECTOR = {
    "version": "detector-0.1",
    "acute": {"z_threshold": 2.0, "exceedance_share_threshold": 0.2, "consecutive_days": 2},
    "chronic": {"k": 1.0, "h": 10.0, "positive_days": 3, "window_days": 5},
    "data_issue": {"consecutive_days": 2},
    "threshold_provenance": "fixture: illustrative values, not evaluated",
}
# A run of more than this many unscored days resets the CUSUM (rules.py). The eight too-hot
# days (13-20 July) are such a run in every household.
MAX_GAP_DAYS = 2
# Below this daily reference (unit-hours) an excess share would be meaningless; the made-up
# reference is about 28.8 unit-hours a day, far above it.
EXCESS_REFERENCE_FLOOR = 1.0
# Made-up calibrated band around the reference: the upper side is narrower, as after the
# asymmetric calibration of p1-v3.
LOWER_OFFSET = 0.6
UPPER_OFFSET = 0.25
# On days without a deviation the readings sit 2% above the reference.
NORMAL_EXCESS = 0.02


def temperature(day: date, local_hour: int) -> float:
    base = 37.0 if day in TOO_HOT_DAYS else 31.0
    return round(base + 5.0 * math.sin((local_hour - 9) / 24 * 2 * math.pi), 1)


def reference_value(local_hour: int) -> float:
    """Made-up model reference: highest in the afternoon, never negative."""
    return round(max(0.0, 1.2 + 1.0 * math.sin((local_hour - 9) / 24 * 2 * math.pi)), 3)


def made_up_slots(deviation_days: set[date], excess: float, data_gap_days: set[date]) -> pd.DataFrame:
    """15-minute prediction rows of one household for July, in the shape of a P1 run."""
    rows = []
    for day in JULY_DAYS:
        # July in Austin is UTC-5; a local day starts at 05:00 UTC.
        day_start_utc = datetime(day.year, day.month, day.day, 5, 0, tzinfo=timezone.utc)
        scored_day = day not in TOO_HOT_DAYS and day not in data_gap_days
        share = excess if day in deviation_days else NORMAL_EXCESS
        for slot in range(SLOTS_PER_DAY):
            local_hour = slot // 4
            reference = reference_value(local_hour)
            target = round(reference * (1 + share), 3)
            # The outage scenario loses every third hour of readings.
            if day in data_gap_days and local_hour % 3 == 0:
                target = np.nan
            rows.append({
                "ts_utc": pd.Timestamp(day_start_utc + timedelta(minutes=15 * slot)),
                "local_date": day.isoformat(),
                "target": target,
                "q50": reference,
                "lower": round(max(0.0, reference - LOWER_OFFSET), 3),
                "upper": round(reference + UPPER_OFFSET, 3),
                "temperature_c": temperature(day, local_hour),
                "eligible": scored_day,
            })
    return pd.DataFrame(rows)


def made_up_daily_gate(slots: pd.DataFrame, data_gap_days: set[date]) -> pd.DataFrame:
    """Daily-quality rows in the shape of a P1 run: too hot days and outage days fail the gate."""
    rows = []
    for day in JULY_DAYS:
        readings = slots.loc[slots["local_date"].eq(day.isoformat()), "target"]
        if day in TOO_HOT_DAYS:
            reason = "temperature_out_of_support"
        elif day in data_gap_days:
            reason = "insufficient_daily_coverage"
        else:
            reason = None
        rows.append({"local_date": day.isoformat(), "split": "development", "expected_slots": SLOTS_PER_DAY,
                     "valid_joint_slots": int(readings.notna().sum()), "day_eligible": reason is None,
                     "reasons": reason})
    return pd.DataFrame(rows)


def chronic_case_days(table: pd.DataFrame, chronic: list[dict]) -> pd.Series:
    """Scored days with a positive z inside a chronic candidate (onset to last day).

    The chronic rule has no daily threshold of its own; inside a chronic case the days whose
    residual is above the June median (z > 0) are its evidence.
    """
    inside_a_case = pd.Series(False, index=table.index)
    for candidate in chronic:
        inside_a_case = inside_a_case | table["local_date"].between(candidate["onset"], candidate["last"])
    return table["scored"].astype(bool) & table["z"].gt(0) & inside_a_case


def detect_household(plan: dict) -> dict:
    """Daily table and the single case of one made-up household, computed by the package."""
    deviation_days = set()
    if plan["deviation"] is not None:
        first, last = plan["deviation"]["first_day"], plan["deviation"]["last_day"]
        deviation_days = {first + timedelta(days=offset) for offset in range((last - first).days + 1)}
    excess = plan["deviation"]["excess"] if plan["deviation"] is not None else NORMAL_EXCESS

    # 1. Made-up readings and daily gate, then the package's daily statistics and z.
    slots = made_up_slots(deviation_days, excess, plan["data_gap_days"])
    days = made_up_daily_gate(slots, plan["data_gap_days"])
    table = household_daily_table(slots, days, EXCESS_REFERENCE_FLOOR)
    table = add_z(table, plan["june_reference"])

    # 2. The detector rules on the daily table.
    statistic = cusum_series(table, DETECTOR["chronic"], MAX_GAP_DAYS)
    table["cusum"] = statistic
    acute = acute_candidates(table, DETECTOR["acute"], MAX_GAP_DAYS)
    chronic = chronic_candidates(table, statistic, DETECTOR["chronic"], MAX_GAP_DAYS)
    data_issues = data_issue_candidates(table, DETECTOR["data_issue"])
    table["flagged"] = acute_day_flags(table, DETECTOR["acute"]) | chronic_case_days(table, chronic)

    # 3. Each made-up household is designed to give exactly one case; stop if it does not.
    cases = merge_into_cases(acute, chronic, data_issues)
    if len(cases) != 1:
        raise ValueError(f"household {plan['household_id']}: expected one case, the rules gave {cases}")
    return {"slots": slots, "table": table, "case": cases[0]}


def excess_unit_hours(table: pd.DataFrame, case: dict) -> float | None:
    """Observed minus reference over the flagged days; the ranking key of the contract."""
    if case["kind"] != "consumption_deviation":
        return None
    in_case = table["local_date"].between(case["onset"], case["last"])
    flagged = table.loc[in_case & table["flagged"] & table["scored"]]
    return float(flagged["observed_unit_hours"].sum() - flagged["reference_unit_hours"].sum())


def household_plans() -> list[dict]:
    """The four made-up households. The June reference sets the daily z; its scale is chosen
    so that the intended rule fires (acute for 90001 and 90003, chronic for 90002)."""
    return [
        {"household_id": 90001, "origin": "synthetic", "case_id": "SW-SYN-HVAC-90001-20180707-ACU",
         "deviation": {"first_day": date(2018, 7, 7), "last_day": date(2018, 7, 10), "excess": 0.31},
         "data_gap_days": set(), "june_reference": {"median": 0.0, "scale": 2.8, "days": 30},
         "synthetic": {"scenario": "step_increase", "fault_kind": None, "severity": 0.3, "duration_days": 7,
                       "start_local_date": "2018-07-07", "seed": 101, "generator_version": "fixture"}},
        {"household_id": 90002, "origin": "synthetic", "case_id": "SW-SYN-HVAC-90002-20180722-CHR",
         "deviation": {"first_day": date(2018, 7, 22), "last_day": date(2018, 7, 31), "excess": 0.12},
         "data_gap_days": set(), "june_reference": {"median": 0.0, "scale": 1.2, "days": 30},
         "synthetic": {"scenario": "ramp_increase", "fault_kind": None, "severity": 0.2, "duration_days": 14,
                       "start_local_date": "2018-07-18", "seed": 102, "generator_version": "fixture"}},
        {"household_id": 90003, "origin": "observed", "case_id": "SW-HVAC-90003-20180703-ACU",
         "deviation": {"first_day": date(2018, 7, 3), "last_day": date(2018, 7, 5), "excess": 0.18},
         "data_gap_days": set(), "june_reference": {"median": 0.0, "scale": 2.0, "days": 30},
         "synthetic": None},
        {"household_id": 90004, "origin": "synthetic", "case_id": "SW-SYN-HVAC-90004-20180724-DQ",
         "deviation": None,
         "data_gap_days": {date(2018, 7, 24), date(2018, 7, 25), date(2018, 7, 26)},
         "june_reference": {"median": 0.0, "scale": 2.0, "days": 30},
         "synthetic": {"scenario": "data_fault", "fault_kind": "outage", "severity": None, "duration_days": 3,
                       "start_local_date": "2018-07-24", "seed": 103, "generator_version": "fixture"}},
    ]


def build_cases() -> list[dict]:
    plans = household_plans()
    detections = [detect_household(plan) for plan in plans]

    # Rank and priority follow the contract's ordering over all cases.
    entries = []
    for plan, detection in zip(plans, detections):
        case = detection["case"]
        in_case = detection["table"]["local_date"].between(case["onset"], case["last"])
        entries.append({"case_id": plan["case_id"], "kind": case["kind"],
                        "excess_unit_hours": excess_unit_hours(detection["table"], case),
                        "flagged_days": int((in_case & detection["table"]["flagged"]).sum())})
    ranking = {entry["case_id"]: entry for entry in rank_and_prioritize(entries)}

    cases = []
    for plan, detection in zip(plans, detections):
        entry = ranking[plan["case_id"]]
        case_file = build_case(plan["household_id"], detection["case"], detection["table"], detection["slots"],
                               plan["origin"], plan["synthetic"], entry["rank"], entry["priority"],
                               REPLAY_WINDOW, EXCESS_REFERENCE_FLOOR)
        if case_file["case_id"] != plan["case_id"]:
            raise ValueError(f"expected {plan['case_id']}, the rules gave {case_file['case_id']}")
        cases.append(case_file)
    return cases


def build_index(cases: list[dict]) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": "2026-10-14T00:00:00Z",
        "fixture": True,
        "run": {
            "run_id": "fixture-0.1", "source_run": "fixture (made-up values)", "dataset_id": "fixture",
            "protocol_version": "p1-v3", "model": "B0",
            "replay_window": REPLAY_WINDOW,
            "unit": "source_unit_unverified", "households": 4, "detector": DETECTOR,
            "synthetic_plan": {"plan_id": "fixture", "generator_version": "fixture", "seed": 100,
                               "scenarios": [
                                   {"scenario": "step_increase", "fault_kind": None, "severity": 0.3, "duration_days": 7},
                                   {"scenario": "ramp_increase", "fault_kind": None, "severity": 0.2, "duration_days": 14},
                                   {"scenario": "data_fault", "fault_kind": "outage", "severity": None, "duration_days": 3}]},
        },
        "evaluation": {
            "clean_household_days": 40, "false_cases_on_clean_data": 1, "synthetic_cases": 3, "synthetic_detected": 3,
            "by_scenario": [
                {"scenario": "step_increase", "fault_kind": None, "severity": 0.3, "duration_days": 7,
                 "injected": 1, "detected": 1, "median_delay_days": 1},
                {"scenario": "ramp_increase", "fault_kind": None, "severity": 0.2, "duration_days": 14,
                 "injected": 1, "detected": 1, "median_delay_days": 9},
                {"scenario": "data_fault", "fault_kind": "outage", "severity": None, "duration_days": 3,
                 "injected": 1, "detected": 1, "median_delay_days": 1}],
            "data_faults_caught_by_quality_gate": 1,
        },
        "cases": [summary_of(case) for case in sorted(cases, key=lambda case: case["rank"])],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Write the synthetic evidence fixtures.")
    parser.add_argument("--output", default="shared/fixtures/evidence")
    args = parser.parse_args()
    output = Path(args.output)
    (output / "cases").mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    for case in cases:
        # Case files hold hundreds of series points, so they are written compactly.
        (output / "cases" / f"{case['case_id']}.json").write_text(
            json.dumps(case, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (output / "index.json").write_text(
        json.dumps(build_index(cases), indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(f"{len(cases)} fixture cases written to {output}")


if __name__ == "__main__":
    main()
