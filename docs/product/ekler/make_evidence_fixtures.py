"""Write the committed evidence fixtures (contract silentwatt.evidence/0.1).

The fixtures let the API and the console be built and tested without the private
Pecan Street files. Every number here is made up: household ids start at 90001 and the
curves are smooth synthetic shapes, not measurements. Rerunning the script gives the
same files byte for byte.

    .venv/bin/python docs/product/ekler/make_evidence_fixtures.py --output shared/fixtures/evidence
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCHEMA_VERSION = "silentwatt.evidence/0.1"
JULY_DAYS = [date(2018, 7, 1) + timedelta(days=offset) for offset in range(31)]
# Hourly temperature shape of a made-up hot month; days 13-20 are too hot to score.
TOO_HOT_DAYS = {date(2018, 7, day) for day in range(13, 21)}
DETECTOR = {
    "version": "detector-0.1",
    "acute": {"z_threshold": 2.0, "exceedance_share_threshold": 0.2, "consecutive_days": 2},
    "chronic": {"k": 0.5, "h": 5.0, "positive_days": 3, "window_days": 5},
    "data_issue": {"consecutive_days": 2},
    "threshold_provenance": "fixture: illustrative values, not evaluated",
}


def temperature(day: date, hour: int) -> float:
    base = 37.0 if day in TOO_HOT_DAYS else 31.0
    return round(base + 5.0 * math.sin((hour - 9) / 24 * 2 * math.pi), 1)


def reference_value(hour: int) -> float:
    """Made-up model reference: higher in the afternoon, never negative."""
    return round(max(0.0, 1.2 + 1.0 * math.sin((hour - 9) / 24 * 2 * math.pi)), 3)


def utc_slots(day: date) -> list[datetime]:
    # July in Austin is UTC-5; a local day starts at 05:00 UTC.
    start = datetime(day.year, day.month, day.day, 5, 0, tzinfo=timezone.utc)
    return [start + timedelta(minutes=15 * index) for index in range(96)]


def daily_rows(flagged: set[date], excess: float, data_gap_days: set[date]) -> list[dict]:
    rows = []
    for day in JULY_DAYS:
        reference = round(sum(reference_value(slot.hour) for slot in utc_slots(day)) * 0.25, 3)
        if day in TOO_HOT_DAYS:
            rows.append({"local_date": day.isoformat(), "scored": False,
                         "not_scored_reason": "temperature_out_of_support", "valid_slots": 96,
                         "expected_slots": 96, "observed_unit_hours": None, "reference_unit_hours": None,
                         "excess_share": None, "upper_exceedance_share": None, "z": None, "cusum": None,
                         "flagged": False, "max_temperature_c": temperature(day, 15)})
            continue
        if day in data_gap_days:
            rows.append({"local_date": day.isoformat(), "scored": False,
                         "not_scored_reason": "insufficient_daily_coverage", "valid_slots": 40,
                         "expected_slots": 96, "observed_unit_hours": None, "reference_unit_hours": None,
                         "excess_share": None, "upper_exceedance_share": None, "z": None, "cusum": None,
                         "flagged": False, "max_temperature_c": temperature(day, 15)})
            continue
        share = excess if day in flagged else 0.02
        rows.append({"local_date": day.isoformat(), "scored": True, "not_scored_reason": None,
                     "valid_slots": 96, "expected_slots": 96,
                     "observed_unit_hours": round(reference * (1 + share), 3),
                     "reference_unit_hours": reference, "excess_share": share,
                     "upper_exceedance_share": 0.41 if day in flagged else 0.06,
                     "z": 3.2 if day in flagged else 0.3, "cusum": 0.0,
                     "flagged": day in flagged, "max_temperature_c": temperature(day, 15)})
    return rows


def series_points(first: date, last: date, flagged: set[date], excess: float, data_gap_days: set[date]) -> list[dict]:
    points = []
    day = first
    while day <= last:
        for slot in utc_slots(day):
            reference = reference_value(slot.hour)
            factor = 1 + excess if day in flagged else 1.02
            observed = round(reference * factor, 3)
            scored = day not in TOO_HOT_DAYS and day not in data_gap_days
            if day in data_gap_days and slot.hour % 3 == 0:
                observed = None
            points.append({"ts_utc": slot.strftime("%Y-%m-%dT%H:%M:%SZ"), "observed": observed,
                           "reference": reference if scored else None,
                           "lower": round(max(0.0, reference - 0.6), 3) if scored else None,
                           "upper": round(reference + 0.7, 3) if scored else None,
                           "temperature_c": temperature(day, (slot.hour - 5) % 24), "scored": scored})
        day += timedelta(days=1)
    return points


def fixture_case(case_id: str, household: int, origin: str, kind: str, detectors: list[str],
                 onset: date, detected: date, last: date, excess: float | None,
                 synthetic: dict | None, reasons: list[dict], recommendation: str,
                 rank: int, priority: int, data_gap_days: set[date] = frozenset()) -> dict:
    flagged = set()
    if kind == "consumption_deviation":
        day = onset
        while day <= last:
            flagged.add(day)
            day += timedelta(days=1)
    window_start = max(JULY_DAYS[0], onset - timedelta(days=3))
    window_end = min(JULY_DAYS[-1], last + timedelta(days=1))
    return {
        "schema_version": SCHEMA_VERSION, "case_id": case_id, "origin": origin, "household_id": household,
        "family": "hvac", "circuit": "air1", "kind": kind, "detectors": detectors,
        "onset_local_date": onset.isoformat(), "detected_local_date": detected.isoformat(),
        "last_local_date": last.isoformat(), "flagged_days": len(flagged) or (last - onset).days + 1,
        "excess_share": excess, "upper_exceedance_share": 0.41 if kind == "consumption_deviation" else None,
        "rank": rank, "rank_basis": "excess_unit_hours_desc,flagged_days_desc,case_id_asc",
        "priority": priority, "recommendation_code": recommendation, "synthetic": synthetic,
        "daily": daily_rows(flagged, excess or 0.0, data_gap_days),
        "series": series_points(window_start, window_end, flagged, excess or 0.0, data_gap_days),
        "reasons": reasons, "recommendation": {"code": recommendation, "library_version": "rec-0.1"},
    }


def build_cases() -> list[dict]:
    return [
        fixture_case("SW-SYN-HVAC-90001-20180707-ACU", 90001, "synthetic", "consumption_deviation", ["acute"],
                     date(2018, 7, 7), date(2018, 7, 8), date(2018, 7, 10), 0.31,
                     {"scenario": "step_increase", "fault_kind": None, "severity": 0.3, "duration_days": 7,
                      "start_local_date": "2018-07-07", "seed": 101, "generator_version": "fixture"},
                     [{"code": "DAILY_EXCESS_Z", "value": 3.2}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 4}, {"code": "EXCESS_OVER_REFERENCE", "value": 0.31}],
                     "HVAC_PERSISTENT_INCREASE", rank=1, priority=1),
        fixture_case("SW-SYN-HVAC-90002-20180722-CHR", 90002, "synthetic", "consumption_deviation", ["chronic"],
                     date(2018, 7, 22), date(2018, 7, 27), date(2018, 7, 31), 0.12,
                     {"scenario": "ramp_increase", "fault_kind": None, "severity": 0.2, "duration_days": 14,
                      "start_local_date": "2018-07-18", "seed": 102, "generator_version": "fixture"},
                     [{"code": "PERSISTENT_CUSUM", "value": 6.1}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "EXCESS_OVER_REFERENCE", "value": 0.12}, {"code": "DAYS_NOT_SCORED", "value": 3}],
                     "HVAC_PERSISTENT_INCREASE", rank=2, priority=2),
        fixture_case("SW-HVAC-90003-20180703-ACU", 90003, "observed", "consumption_deviation", ["acute"],
                     date(2018, 7, 3), date(2018, 7, 4), date(2018, 7, 5), 0.18, None,
                     [{"code": "DAILY_EXCESS_Z", "value": 2.6}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 3}, {"code": "EXCESS_OVER_REFERENCE", "value": 0.18}],
                     "HVAC_PERSISTENT_INCREASE", rank=3, priority=3),
        fixture_case("SW-SYN-HVAC-90004-20180724-DQ", 90004, "synthetic", "data_issue", ["data_quality"],
                     date(2018, 7, 24), date(2018, 7, 25), date(2018, 7, 26), None,
                     {"scenario": "data_fault", "fault_kind": "outage", "severity": None, "duration_days": 3,
                      "start_local_date": "2018-07-24", "seed": 103, "generator_version": "fixture"},
                     [{"code": "MISSING_READINGS", "value": 0.58}],
                     "DATA_SOURCE_CHECK", rank=4, priority=3,
                     data_gap_days={date(2018, 7, 24), date(2018, 7, 25), date(2018, 7, 26)}),
    ]


def summary_of(case: dict) -> dict:
    fields = ["case_id", "origin", "household_id", "family", "circuit", "kind", "detectors",
              "onset_local_date", "detected_local_date", "last_local_date", "flagged_days", "excess_share",
              "upper_exceedance_share", "rank", "rank_basis", "priority", "recommendation_code"]
    return {field: case[field] for field in fields}


def build_index(cases: list[dict]) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": "2026-10-06T00:00:00Z",
        "fixture": True,
        "run": {
            "run_id": "fixture-0.1", "source_run": "fixture (made-up values)", "dataset_id": "fixture",
            "protocol_version": "p1-v2", "model": "B0",
            "replay_window": {"split": "development", "start_local_date": "2018-07-01", "end_local_date": "2018-08-01"},
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
        "cases": [summary_of(case) for case in cases],
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
