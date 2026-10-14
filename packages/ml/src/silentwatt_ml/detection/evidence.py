"""Evidence files of the contract silentwatt.evidence/0.2 (docs/architecture/evidence-contract.md).

build_case turns one detected case into the case file; validate_case checks a case file
against the contract rules before anything is written. Missing values are written as JSON
null, never as 0, and no date may leave the replay window.

v0.2 adds device families: hvac (air1), refrigeration (refrigerator1) and solar (solar), and the
production_shortfall kind for solar. HVAC callers that pass no family write the same case as before.
"""
from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

SCHEMA_VERSION = "silentwatt.evidence/0.2"
LIBRARY_VERSION = "rec-0.2"
RANK_BASIS = "abs_deviation_unit_hours_desc,flagged_days_desc,case_id_asc"
DETECTOR_SUFFIX = {"acute": "ACU", "chronic": "CHR", "data_quality": "DQ"}
FAMILIES = {
    "hvac": {"circuit": "air1", "prefix": "HVAC"},
    "refrigeration": {"circuit": "refrigerator1", "prefix": "REF"},
    "solar": {"circuit": "solar", "prefix": "SOL"},
}
KINDS = {"consumption_deviation", "production_shortfall", "data_issue"}
RECOMMENDATIONS = {
    ("hvac", "consumption_deviation"): "HVAC_PERSISTENT_INCREASE",
    ("refrigeration", "consumption_deviation"): "REFRIGERATOR_PERSISTENT_INCREASE",
    ("solar", "production_shortfall"): "SOLAR_PRODUCTION_SHORTFALL",
}


def recommendation_for(family: str, kind: str) -> str | None:
    """The rec-0.2 code of a case; a data issue is never a device signal, whatever the family."""
    return "DATA_SOURCE_CHECK" if kind == "data_issue" else RECOMMENDATIONS.get((family, kind))
REASON_CODES = {"DAILY_EXCESS_Z", "UPPER_BOUND_EXCEEDANCE", "LOWER_BOUND_SHORTFALL", "CONSECUTIVE_FLAGGED_DAYS",
                "PERSISTENT_CUSUM", "EXCESS_OVER_REFERENCE", "SHORTFALL_BELOW_REFERENCE", "DAYS_NOT_SCORED",
                "MISSING_READINGS", "FROZEN_READINGS"}
SUMMARY_FIELDS = ["case_id", "origin", "household_id", "family", "circuit", "kind", "detectors",
                  "onset_local_date", "detected_local_date", "last_local_date", "flagged_days", "excess_share",
                  "upper_exceedance_share", "lower_shortfall_share", "rank", "rank_basis", "priority",
                  "recommendation_code"]
# Days of context shown before the onset and after the last flagged day.
SERIES_DAYS_BEFORE = 3
SERIES_DAYS_AFTER = 1


def json_number(value, digits: int = 4):
    """A finite number rounded for the file, or None; NaN and infinity become null."""
    if value is None:
        return None
    value = float(value)
    if not math.isfinite(value):
        return None
    return round(value, digits)


def case_id(household_id: int, onset: str, detectors: list[str], origin: str, family: str = "hvac") -> str:
    family_prefix = FAMILIES[family]["prefix"]
    prefix = f"SW-SYN-{family_prefix}" if origin == "synthetic" else f"SW-{family_prefix}"
    suffix = "-".join(DETECTOR_SUFFIX[name] for name in detectors)
    return f"{prefix}-{household_id:04d}-{onset.replace('-', '')}-{suffix}"


def _shift(day: str, days: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


def build_case(household_id: int, case: dict, daily_table: pd.DataFrame, slots: pd.DataFrame, origin: str,
               synthetic: dict | None, rank: int, priority: int, replay_window: dict,
               excess_reference_floor: float, family: str = "hvac") -> dict:
    """The case file of one detected case.

    daily_table: the household's daily table with z, cusum and flagged columns; for solar also
    lower_shortfall_slots (valid slots below the calibrated lower bound).
    slots: the household's prediction rows (development), used for the chart series.
    """
    development = daily_table.loc[daily_table["split"].eq("development")].sort_values("local_date")
    in_window = development["local_date"].between(case["onset"], case["last"])
    window = development.loc[in_window]

    lower_share = None
    if case["kind"] in ("consumption_deviation", "production_shortfall"):
        flagged = window.loc[window["flagged"].astype(bool) & window["scored"].astype(bool)]
        flagged_days = int(len(flagged))
        observed = flagged["observed_unit_hours"].sum()
        reference = flagged["reference_unit_hours"].sum()
        excess_share = observed / reference - 1 if reference >= excess_reference_floor else None
        used = flagged["used_slots"].sum()
        if case["kind"] == "consumption_deviation":
            upper_share = flagged["upper_exceedance_slots"].sum() / used if used else None
            reasons = _consumption_reasons(case, flagged, development, excess_share, upper_share)
        else:
            upper_share = None
            lower_share = flagged["lower_shortfall_slots"].sum() / used if used else None
            reasons = _shortfall_reasons(case, flagged, development, excess_share, lower_share)
    else:
        flagged_days = int(len(window))
        excess_share = None
        upper_share = None
        reasons = _data_issue_reasons(window, slots, case)

    summary = {
        "case_id": case_id(household_id, case["onset"], case["detectors"], origin, family),
        "origin": origin,
        "household_id": int(household_id),
        "family": family,
        "circuit": FAMILIES[family]["circuit"],
        "kind": case["kind"],
        "detectors": list(case["detectors"]),
        "onset_local_date": case["onset"],
        "detected_local_date": case["detected"],
        "last_local_date": case["last"],
        "flagged_days": flagged_days,
        "excess_share": json_number(excess_share),
        "upper_exceedance_share": json_number(upper_share),
        "lower_shortfall_share": json_number(lower_share),
        "rank": int(rank),
        "rank_basis": RANK_BASIS,
        "priority": int(priority),
        "recommendation_code": recommendation_for(family, case["kind"]),
    }
    return {
        "schema_version": SCHEMA_VERSION,
        **summary,
        "synthetic": synthetic,
        "daily": [_daily_row(row) for _, row in development.iterrows()],
        "series": _series(slots, case, replay_window),
        "reasons": reasons,
        "recommendation": {"code": summary["recommendation_code"], "library_version": LIBRARY_VERSION},
    }


def _consumption_reasons(case: dict, flagged: pd.DataFrame, development: pd.DataFrame,
                         excess_share, upper_share) -> list[dict]:
    reasons = []
    if "acute" in case["detectors"] and len(flagged):
        reasons.append({"code": "DAILY_EXCESS_Z", "value": json_number(flagged["z"].max(), 2)})
    if upper_share is not None:
        reasons.append({"code": "UPPER_BOUND_EXCEEDANCE", "value": json_number(upper_share)})
    if "acute" in case["detectors"]:
        reasons.append({"code": "CONSECUTIVE_FLAGGED_DAYS", "value": int(len(flagged))})
    if "chronic" in case["detectors"]:
        in_case = development["local_date"].between(case["onset"], case["last"])
        reasons.append({"code": "PERSISTENT_CUSUM", "value": json_number(development.loc[in_case, "cusum"].max(), 2)})
    if excess_share is not None:
        reasons.append({"code": "EXCESS_OVER_REFERENCE", "value": json_number(excess_share)})
    context = development["local_date"].between(_shift(case["onset"], -SERIES_DAYS_BEFORE), case["last"])
    not_scored = int((~development.loc[context, "scored"].astype(bool)).sum())
    if not_scored:
        reasons.append({"code": "DAYS_NOT_SCORED", "value": not_scored})
    return reasons


def _shortfall_reasons(case: dict, flagged: pd.DataFrame, development: pd.DataFrame,
                       excess_share, lower_share) -> list[dict]:
    """Production below the reference (solar): the mirror of _consumption_reasons."""
    reasons = []
    if lower_share is not None:
        reasons.append({"code": "LOWER_BOUND_SHORTFALL", "value": json_number(lower_share)})
    if "acute" in case["detectors"]:
        reasons.append({"code": "CONSECUTIVE_FLAGGED_DAYS", "value": int(len(flagged))})
    if "chronic" in case["detectors"]:
        in_case = development["local_date"].between(case["onset"], case["last"])
        reasons.append({"code": "PERSISTENT_CUSUM", "value": json_number(development.loc[in_case, "cusum"].max(), 2)})
    if excess_share is not None:
        reasons.append({"code": "SHORTFALL_BELOW_REFERENCE", "value": json_number(excess_share)})
    context = development["local_date"].between(_shift(case["onset"], -SERIES_DAYS_BEFORE), case["last"])
    not_scored = int((~development.loc[context, "scored"].astype(bool)).sum())
    if not_scored:
        reasons.append({"code": "DAYS_NOT_SCORED", "value": not_scored})
    return reasons


def _data_issue_reasons(window: pd.DataFrame, slots: pd.DataFrame, case: dict) -> list[dict]:
    missing_share = 1 - window["valid_slots"].sum() / window["expected_slots"].sum()
    reasons = [{"code": "MISSING_READINGS", "value": json_number(missing_share)}]
    if "frozen_suspected" in slots.columns:
        in_case = slots["local_date"].between(case["onset"], case["last"])
        frozen = int(slots.loc[in_case, "frozen_suspected"].fillna(False).astype(bool).sum())
        if frozen:
            reasons.append({"code": "FROZEN_READINGS", "value": frozen})
    return reasons


def _daily_row(row: pd.Series) -> dict:
    reason = row["not_scored_reason"] if isinstance(row["not_scored_reason"], str) else None
    return {
        "local_date": row["local_date"],
        "scored": bool(row["scored"]),
        "not_scored_reason": reason,
        "valid_slots": int(row["valid_slots"]),
        "expected_slots": int(row["expected_slots"]),
        "observed_unit_hours": json_number(row["observed_unit_hours"], 3),
        "reference_unit_hours": json_number(row["reference_unit_hours"], 3),
        "excess_share": json_number(row["excess_share"]),
        "upper_exceedance_share": json_number(row["upper_exceedance_share"]),
        "lower_shortfall_share": json_number(row.get("lower_shortfall_share")),
        "z": json_number(row["z"], 2),
        "cusum": json_number(row["cusum"], 2),
        "flagged": bool(row["flagged"]),
        "max_temperature_c": json_number(row["max_temperature_c"], 1),
    }


def _series(slots: pd.DataFrame, case: dict, replay_window: dict) -> list[dict]:
    first = max(_shift(case["onset"], -SERIES_DAYS_BEFORE), replay_window["start_local_date"])
    last = min(_shift(case["last"], SERIES_DAYS_AFTER), _shift(replay_window["end_local_date"], -1))
    window = slots.loc[slots["local_date"].between(first, last)].sort_values("ts_utc")
    points = []
    for _, row in window.iterrows():
        points.append({
            "ts_utc": pd.Timestamp(row["ts_utc"]).tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
            "observed": json_number(row["target"]),
            "reference": json_number(row["q50"]),
            "lower": json_number(row["lower"]),
            "upper": json_number(row["upper"]),
            "temperature_c": json_number(row["temperature_c"], 1),
            "scored": bool(row["eligible"]),
        })
    return points


def _inside(day: str, replay_window: dict) -> bool:
    return replay_window["start_local_date"] <= day < replay_window["end_local_date"]


def validate_case(case: dict, replay_window: dict, timezone: str = "America/Chicago") -> list[str]:
    """Contract errors of one case file; an empty list means it may be written."""
    errors = []
    if case.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version {case.get('schema_version')!r} is not {SCHEMA_VERSION}")
    missing = [field for field in [*SUMMARY_FIELDS, "synthetic", "daily", "series", "reasons", "recommendation"]
               if field not in case]
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
        return errors
    if case["origin"] not in ("observed", "synthetic"):
        errors.append(f"unknown origin {case['origin']!r}")
    if (case["origin"] == "synthetic") != (case["synthetic"] is not None):
        errors.append("synthetic details must be present exactly for synthetic cases")
    if case["origin"] == "synthetic" and not case["case_id"].startswith("SW-SYN-"):
        errors.append("synthetic case_id must start with SW-SYN-")
    if case["family"] not in FAMILIES:
        errors.append(f"unknown family {case['family']!r}")
    elif case["circuit"] != FAMILIES[case["family"]]["circuit"]:
        errors.append(f"circuit {case['circuit']!r} does not belong to {case['family']}")
    if case["kind"] not in KINDS:
        errors.append(f"unknown kind {case['kind']!r}")
    elif case["family"] in FAMILIES and recommendation_for(case["family"], case["kind"]) is None:
        errors.append(f"{case['family']} has no {case['kind']} cases")
    elif case["family"] in FAMILIES and case["recommendation_code"] != recommendation_for(case["family"], case["kind"]):
        errors.append("recommendation does not match the family and kind")
    if any(name not in DETECTOR_SUFFIX for name in case["detectors"]):
        errors.append("unknown detector")
    if any(reason["code"] not in REASON_CODES for reason in case["reasons"]):
        errors.append("unknown reason code")

    dates = [case["onset_local_date"], case["detected_local_date"], case["last_local_date"]]
    dates += [row["local_date"] for row in case["daily"]]
    for point in case["series"]:
        local = pd.Timestamp(point["ts_utc"]).tz_convert(timezone).date().isoformat()
        dates.append(local)
    outside = sorted({day for day in dates if not _inside(day, replay_window)})
    if outside:
        errors.append(f"dates outside the replay window: {', '.join(outside[:3])}")

    for value in _numbers(case):
        if isinstance(value, float) and not math.isfinite(value):
            errors.append("non-finite number")
            break
    return errors


def _numbers(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _numbers(item)
    elif isinstance(value, list):
        for item in value:
            yield from _numbers(item)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        yield value


def summary_of(case: dict) -> dict:
    return {field: case[field] for field in SUMMARY_FIELDS}


def write_evidence(directory: Path, index: dict, cases: list[dict]) -> None:
    """Write index.json and one file per case; the directory must not exist yet."""
    directory.mkdir(parents=True, exist_ok=False)
    (directory / "cases").mkdir()
    for case in cases:
        (directory / "cases" / f"{case['case_id']}.json").write_text(
            json.dumps(case, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (directory / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def rank_and_prioritize(entries: list[dict]) -> list[dict]:
    """Order cases as the contract says and give priorities by thirds of the deviation ranking.

    entries: dicts with case_id, kind, excess_unit_hours (positive delta, may be None) and
    flagged_days. Data issues rank after every consumption deviation and get priority 3.
    """
    deviations = [e for e in entries if e["kind"] == "consumption_deviation"]
    data_issues = [e for e in entries if e["kind"] == "data_issue"]
    deviations.sort(key=lambda e: (-(e["excess_unit_hours"] or 0.0), -e["flagged_days"], e["case_id"]))
    data_issues.sort(key=lambda e: e["case_id"])
    ordered = deviations + data_issues
    for position, entry in enumerate(ordered, start=1):
        entry["rank"] = position
    count = len(deviations)
    for position, entry in enumerate(deviations):
        entry["priority"] = 1 + int(3 * position / count) if count else 3
    for entry in data_issues:
        entry["priority"] = 3
    return ordered
