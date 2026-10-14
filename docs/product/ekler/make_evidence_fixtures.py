"""Write the committed evidence fixtures (contract silentwatt.evidence/0.2).

The fixtures let the API and the console be built and tested without the private
Pecan Street files. Every number here is made up: household ids start at 90001 and the
curves are smooth synthetic shapes, not measurements. Rerunning the script gives the
same files byte for byte.

Three families, each with its own expected-behaviour shape:
- hvac (air1): follows the outdoor temperature; the hottest days fall outside the training range
- refrigeration (refrigerator1): compressor cycles around a flat daily profile
- solar (solar): a daylight production curve; the case is a production shortfall

    .venv/bin/python docs/product/ekler/make_evidence_fixtures.py --output shared/fixtures/evidence
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCHEMA_VERSION = "silentwatt.evidence/0.2"
RANK_BASIS = "abs_deviation_unit_hours_desc,flagged_days_desc,case_id_asc"
JULY_DAYS = [date(2018, 7, 1) + timedelta(days=offset) for offset in range(31)]
# Hourly temperature shape of a made-up hot month; days 13-20 are too hot to score HVAC on.
TOO_HOT_DAYS = {date(2018, 7, day) for day in range(13, 21)}
DETECTOR = {
    "version": "detector-0.2",
    "acute": {"z_threshold": 2.0, "exceedance_share_threshold": 0.2, "consecutive_days": 2},
    "chronic": {"k": 0.5, "h": 5.0, "positive_days": 3, "window_days": 5},
    "data_issue": {"consecutive_days": 2},
    "threshold_provenance": "fixture: illustrative values, not evaluated",
}
FAMILIES = {
    "hvac": {"circuit": "air1", "prefix": "HVAC", "expected_from": "outdoor_temperature,hour"},
    "refrigeration": {"circuit": "refrigerator1", "prefix": "REF", "expected_from": "own_june_profile,hour_of_week"},
    "solar": {"circuit": "solar", "prefix": "SOL", "expected_from": "clear_sky_irradiance,capacity"},
}
RECOMMENDATION = {
    ("hvac", "consumption_deviation"): "HVAC_PERSISTENT_INCREASE",
    ("refrigeration", "consumption_deviation"): "REFRIGERATOR_PERSISTENT_INCREASE",
    ("solar", "production_shortfall"): "SOLAR_PRODUCTION_SHORTFALL",
}


def temperature(day: date, hour: int) -> float:
    base = 37.0 if day in TOO_HOT_DAYS else 31.0
    return round(base + 5.0 * math.sin((hour - 9) / 24 * 2 * math.pi), 1)


def local_hour(slot: datetime) -> float:
    """July in Austin is UTC-5."""
    return ((slot.hour - 5) % 24) + slot.minute / 60


def reference_value(family: str, hour: float) -> float:
    """Made-up model reference for one 15-minute slot at a local hour; never negative."""
    if family == "hvac":
        return round(max(0.0, 1.2 + 1.0 * math.sin((hour - 9) / 24 * 2 * math.pi)), 3)
    if family == "refrigeration":
        return round(0.09 + 0.015 * math.sin((hour - 9) / 24 * 2 * math.pi), 3)
    # Solar: daylight from about 06:30 to 20:00, peak near 13:15.
    if not 6.5 < hour < 20.0:
        return 0.0
    return round(3.5 * math.sin(math.pi * (hour - 6.5) / 13.5), 3)


def cycle(family: str, index: int) -> float:
    """A refrigerator compressor runs one slot in three; other families are smooth."""
    if family != "refrigeration":
        return 1.0
    return 1.6 if index % 3 == 0 else 0.7


def utc_slots(day: date) -> list[datetime]:
    # A local day starts at 05:00 UTC in July.
    start = datetime(day.year, day.month, day.day, 5, 0, tzinfo=timezone.utc)
    return [start + timedelta(minutes=15 * index) for index in range(96)]


def scorable(family: str, day: date, data_gap_days: set[date]) -> bool:
    return day not in data_gap_days and not (family == "hvac" and day in TOO_HOT_DAYS)


def band(family: str, reference: float) -> tuple[float, float]:
    if family == "hvac":
        return round(max(0.0, reference - 0.6), 3), round(reference + 0.7, 3)
    if family == "refrigeration":
        return round(reference * 0.45, 3), round(reference * 1.9, 3)
    return round(reference * 0.8, 3), round(reference * 1.1, 3)


def daily_rows(family: str, kind: str, flagged: set[date], share: float, data_gap_days: set[date]) -> list[dict]:
    rows = []
    for day in JULY_DAYS:
        reference = round(sum(reference_value(family, local_hour(slot)) for slot in utc_slots(day)) * 0.25, 3)
        empty = {"observed_unit_hours": None, "reference_unit_hours": None, "excess_share": None,
                 "upper_exceedance_share": None, "lower_shortfall_share": None, "z": None, "cusum": None,
                 "flagged": False, "max_temperature_c": temperature(day, 15)}
        if family == "hvac" and day in TOO_HOT_DAYS:
            rows.append({"local_date": day.isoformat(), "scored": False, "not_scored_reason": "temperature_out_of_support",
                         "valid_slots": 96, "expected_slots": 96, **empty})
            continue
        if day in data_gap_days:
            rows.append({"local_date": day.isoformat(), "scored": False, "not_scored_reason": "insufficient_daily_coverage",
                         "valid_slots": 40, "expected_slots": 96, **empty})
            continue
        hit = day in flagged
        day_share = share if hit else (-0.02 if kind == "production_shortfall" else 0.02)
        rows.append({
            "local_date": day.isoformat(), "scored": True, "not_scored_reason": None,
            "valid_slots": 96, "expected_slots": 96,
            "observed_unit_hours": round(reference * (1 + day_share), 3), "reference_unit_hours": reference,
            "excess_share": day_share,
            "upper_exceedance_share": None if kind == "production_shortfall" else (0.41 if hit else 0.06),
            "lower_shortfall_share": (0.62 if hit else 0.04) if kind == "production_shortfall" else None,
            "z": (-3.4 if kind == "production_shortfall" else 3.2) if hit else 0.3,
            "cusum": 0.0, "flagged": hit, "max_temperature_c": temperature(day, 15),
        })
    return rows


def series_points(family: str, first: date, last: date, flagged: set[date], share: float,
                  data_gap_days: set[date]) -> list[dict]:
    points = []
    day = first
    while day <= last:
        for index, slot in enumerate(utc_slots(day)):
            hour = local_hour(slot)
            reference = reference_value(family, hour)
            factor = 1 + share if day in flagged else 1.02
            observed = round(reference * factor * cycle(family, index), 3)
            scored = scorable(family, day, data_gap_days)
            if day in data_gap_days and slot.hour % 3 == 0:
                observed = None
            lower, upper = band(family, reference)
            points.append({"ts_utc": slot.strftime("%Y-%m-%dT%H:%M:%SZ"), "observed": observed,
                           "reference": reference if scored else None,
                           "lower": lower if scored else None, "upper": upper if scored else None,
                           "temperature_c": temperature(day, int(hour)), "scored": scored})
        day += timedelta(days=1)
    return points


def fixture_case(family: str, household: int, origin: str, kind: str, detectors: list[str],
                 onset: date, detected: date, last: date, share: float | None,
                 synthetic: dict | None, reasons: list[dict], data_gap_days: set[date] = frozenset()) -> dict:
    meta = FAMILIES[family]
    suffix = "-".join({"acute": "ACU", "chronic": "CHR", "data_quality": "DQ"}[d] for d in detectors)
    prefix = f"SW-SYN-{meta['prefix']}" if origin == "synthetic" else f"SW-{meta['prefix']}"
    case_id = f"{prefix}-{household}-{onset.strftime('%Y%m%d')}-{suffix}"
    flagged = set()
    if kind != "data_issue":
        day = onset
        while day <= last:
            if scorable(family, day, data_gap_days):
                flagged.add(day)
            day += timedelta(days=1)
    recommendation = RECOMMENDATION.get((family, kind), "DATA_SOURCE_CHECK")
    daily = daily_rows(family, kind, flagged, share or 0.0, data_gap_days)
    window_start = max(JULY_DAYS[0], onset - timedelta(days=3))
    window_end = min(JULY_DAYS[-1], last + timedelta(days=1))
    deviation = sum(abs(row["observed_unit_hours"] - row["reference_unit_hours"]) for row in daily if row["flagged"])
    return {
        "schema_version": SCHEMA_VERSION, "case_id": case_id, "origin": origin, "household_id": household,
        "family": family, "circuit": meta["circuit"], "kind": kind, "detectors": detectors,
        "onset_local_date": onset.isoformat(), "detected_local_date": detected.isoformat(),
        "last_local_date": last.isoformat(), "flagged_days": len(flagged) or (last - onset).days + 1,
        "excess_share": share,
        "upper_exceedance_share": 0.41 if kind == "consumption_deviation" else None,
        "lower_shortfall_share": 0.62 if kind == "production_shortfall" else None,
        "rank": 0, "rank_basis": RANK_BASIS, "priority": 3, "recommendation_code": recommendation,
        "synthetic": synthetic, "daily": daily,
        "series": series_points(family, window_start, window_end, flagged, share or 0.0, data_gap_days),
        "reasons": reasons, "recommendation": {"code": recommendation, "library_version": "rec-0.2"},
        "_deviation_unit_hours": round(deviation, 3),
    }


def injected(scenario: str, severity: float | None, days: int, start: date, seed: int, fault_kind: str | None = None) -> dict:
    return {"scenario": scenario, "fault_kind": fault_kind, "severity": severity, "duration_days": days,
            "start_local_date": start.isoformat(), "seed": seed, "generator_version": "fixture"}


def july(day: int) -> date:
    return date(2018, 7, day)


def build_cases() -> list[dict]:
    cases = [
        fixture_case("hvac", 90001, "synthetic", "consumption_deviation", ["acute"], july(7), july(8), july(10), 0.31,
                     injected("step_increase", 0.3, 7, july(7), 101),
                     [{"code": "DAILY_EXCESS_Z", "value": 3.2}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 4}, {"code": "EXCESS_OVER_REFERENCE", "value": 0.31}]),
        fixture_case("hvac", 90002, "synthetic", "consumption_deviation", ["chronic"], july(22), july(27), july(31), 0.12,
                     injected("ramp_increase", 0.2, 14, july(18), 102),
                     [{"code": "PERSISTENT_CUSUM", "value": 6.1}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "EXCESS_OVER_REFERENCE", "value": 0.12}, {"code": "DAYS_NOT_SCORED", "value": 3}]),
        fixture_case("hvac", 90003, "observed", "consumption_deviation", ["acute"], july(3), july(4), july(5), 0.18, None,
                     [{"code": "DAILY_EXCESS_Z", "value": 2.6}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.41},
                      {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 3}, {"code": "EXCESS_OVER_REFERENCE", "value": 0.18}]),
        fixture_case("hvac", 90004, "synthetic", "data_issue", ["data_quality"], july(24), july(25), july(26), None,
                     injected("data_fault", None, 3, july(24), 103, "outage"),
                     [{"code": "MISSING_READINGS", "value": 0.58}],
                     data_gap_days={july(24), july(25), july(26)}),
        fixture_case("refrigeration", 90005, "observed", "consumption_deviation", ["chronic"], july(9), july(14), july(21), 0.27, None,
                     [{"code": "PERSISTENT_CUSUM", "value": 7.4}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.33},
                      {"code": "EXCESS_OVER_REFERENCE", "value": 0.27}]),
        fixture_case("refrigeration", 90006, "synthetic", "consumption_deviation", ["acute"], july(16), july(17), july(20), 0.4,
                     injected("step_increase", 0.4, 5, july(16), 104),
                     [{"code": "DAILY_EXCESS_Z", "value": 3.9}, {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.38},
                      {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 5}, {"code": "EXCESS_OVER_REFERENCE", "value": 0.4}]),
        fixture_case("solar", 90007, "synthetic", "production_shortfall", ["acute"], july(10), july(11), july(16), -0.35,
                     injected("production_drop", 0.35, 7, july(10), 105),
                     [{"code": "LOWER_BOUND_SHORTFALL", "value": 0.62}, {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 7},
                      {"code": "SHORTFALL_BELOW_REFERENCE", "value": -0.35}]),
        fixture_case("solar", 90008, "observed", "production_shortfall", ["acute"], july(25), july(26), july(29), -0.18, None,
                     [{"code": "LOWER_BOUND_SHORTFALL", "value": 0.62}, {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 5},
                      {"code": "SHORTFALL_BELOW_REFERENCE", "value": -0.18}]),
    ]
    # Rank as the contract says: deviations by absolute unit-hours, data issues last; priority by thirds.
    deviations = sorted((c for c in cases if c["kind"] != "data_issue"),
                        key=lambda c: (-c["_deviation_unit_hours"], -c["flagged_days"], c["case_id"]))
    issues = sorted((c for c in cases if c["kind"] == "data_issue"), key=lambda c: c["case_id"])
    for position, case in enumerate(deviations + issues, start=1):
        case["rank"] = position
        case["priority"] = 1 + (3 * (position - 1)) // len(deviations) if case["kind"] != "data_issue" else 3
        del case["_deviation_unit_hours"]
    return deviations + issues


def summary_of(case: dict) -> dict:
    fields = ["case_id", "origin", "household_id", "family", "circuit", "kind", "detectors",
              "onset_local_date", "detected_local_date", "last_local_date", "flagged_days", "excess_share",
              "upper_exceedance_share", "lower_shortfall_share", "rank", "rank_basis", "priority", "recommendation_code"]
    return {field: case[field] for field in fields}


def scenario_row(family: str, scenario: str, severity: float | None, days: int, delay: int, fault_kind: str | None = None) -> dict:
    return {"family": family, "scenario": scenario, "fault_kind": fault_kind, "severity": severity, "duration_days": days,
            "injected": 1, "detected": 1, "median_delay_days": delay}


def build_index(cases: list[dict]) -> dict:
    households = {family: len({c["household_id"] for c in cases if c["family"] == family}) for family in FAMILIES}
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": "2026-10-14T00:00:00Z",
        "fixture": True,
        "run": {
            "run_id": "fixture-0.2", "source_run": "fixture (made-up values)", "dataset_id": "fixture",
            "protocol_version": "p1-v2", "model": "B0",
            "replay_window": {"split": "development", "start_local_date": "2018-07-01", "end_local_date": "2018-08-01"},
            "unit": "source_unit_unverified", "households": len({c["household_id"] for c in cases}),
            "families": [{"family": family, "circuit": meta["circuit"], "households": households[family],
                          "expected_from": meta["expected_from"], "threshold_provenance": None}
                         for family, meta in FAMILIES.items()],
            "detector": DETECTOR,
            "synthetic_plan": {"plan_id": "fixture", "generator_version": "fixture", "seed": 100,
                               "scenarios": [
                                   {"family": "hvac", "scenario": "step_increase", "fault_kind": None, "severity": 0.3, "duration_days": 7},
                                   {"family": "hvac", "scenario": "ramp_increase", "fault_kind": None, "severity": 0.2, "duration_days": 14},
                                   {"family": "hvac", "scenario": "data_fault", "fault_kind": "outage", "severity": None, "duration_days": 3},
                                   {"family": "refrigeration", "scenario": "step_increase", "fault_kind": None, "severity": 0.4, "duration_days": 5},
                                   {"family": "solar", "scenario": "production_drop", "fault_kind": None, "severity": 0.35, "duration_days": 7}]},
        },
        "evaluation": {
            "clean_household_days": 60, "false_cases_on_clean_data": 1, "synthetic_cases": 5, "synthetic_detected": 5,
            "by_scenario": [
                scenario_row("hvac", "step_increase", 0.3, 7, 1),
                scenario_row("hvac", "ramp_increase", 0.2, 14, 9),
                scenario_row("hvac", "data_fault", None, 3, 1, "outage"),
                scenario_row("refrigeration", "step_increase", 0.4, 5, 1),
                scenario_row("solar", "production_drop", 0.35, 7, 1)],
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
    for old in (output / "cases").glob("*.json"):
        old.unlink()
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
