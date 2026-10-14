"""Detector rules on a household's daily table (development split only).

- Acute: a day is flagged when z and the upper-bound exceedance share are both above their
  thresholds; a candidate needs `consecutive_days` flagged scored days in a row.
- Chronic: CUSUM S_d = max(0, S_(d-1) + z_d - k); a candidate needs S_d > h and enough
  positive days among the last scored days.
- Data issue: consecutive days that failed the daily gate for coverage or freeze reasons
  (a temperature outside the training range is not a data issue).

Unscored days never count as flagged or as clean. A gap of up to `max_gap_days` unscored days
keeps a run and freezes the CUSUM; a longer gap ends the run and resets the CUSUM. Threshold
values come from the config; they are hypotheses under evaluation, not physical constants.
Dates are ISO strings, so they compare in calendar order.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DATA_ISSUE_REASONS = ("insufficient_daily_coverage", "frozen_suspected")


def development_days(table: pd.DataFrame) -> pd.DataFrame:
    return table.loc[table["split"].eq("development")].sort_values("local_date")


def acute_day_flags(table: pd.DataFrame, settings: dict) -> pd.Series:
    """True on scored days whose z and upper-bound exceedance share are both above threshold."""
    above_z = table["z"].gt(settings["z_threshold"])
    above_share = table["upper_exceedance_share"].gt(settings["exceedance_share_threshold"])
    return table["scored"].astype(bool) & above_z & above_share


def acute_candidates(table: pd.DataFrame, settings: dict, max_gap_days: int) -> list[dict]:
    days = development_days(table)
    flags = acute_day_flags(days, settings)
    candidates = []
    run_dates = []      # flagged scored days of the current run
    gap = 0             # unscored days since the last scored day
    current = None      # the candidate being extended once the rule is met
    for (_, row), flagged in zip(days.iterrows(), flags):
        if not row["scored"]:
            gap += 1
            if gap > max_gap_days:
                run_dates, current = [], None
            continue
        gap = 0
        if not flagged:
            run_dates, current = [], None
            continue
        run_dates.append(row["local_date"])
        if current is not None:
            current["last"] = row["local_date"]
        elif len(run_dates) >= settings["consecutive_days"]:
            current = {"detector": "acute", "onset": run_dates[0],
                       "detected": row["local_date"], "last": row["local_date"]}
            candidates.append(current)
    return candidates


def cusum_series(table: pd.DataFrame, settings: dict, max_gap_days: int) -> pd.Series:
    """The chronic statistic after each development day; NaN on unscored days."""
    days = development_days(table)
    values = []
    statistic = 0.0
    gap = 0
    for _, row in days.iterrows():
        if not row["scored"]:
            gap += 1
            if gap > max_gap_days:
                statistic = 0.0
            values.append(np.nan)
            continue
        gap = 0
        statistic = max(0.0, statistic + row["z"] - settings["k"])
        values.append(statistic)
    return pd.Series(values, index=days.index, dtype=float)


def chronic_candidates(table: pd.DataFrame, statistic: pd.Series, settings: dict, max_gap_days: int) -> list[dict]:
    days = table.loc[statistic.index]
    candidates = []
    current = None
    excursion_start = None   # first day of the current rise of the statistic from zero
    recent_z = []            # z of the last scored days, newest last
    gap = 0
    for index, row in days.iterrows():
        if not row["scored"]:
            gap += 1
            if gap > max_gap_days:
                # The statistic was reset, so a new excursion starts later.
                excursion_start, current, recent_z = None, None, []
            continue
        gap = 0
        value = statistic.loc[index]
        recent_z = (recent_z + [row["z"]])[-settings["window_days"]:]
        if value <= 0:
            excursion_start, current = None, None
            continue
        if excursion_start is None:
            excursion_start = row["local_date"]
        positive_days = sum(1 for z in recent_z if z > 0)
        if value > settings["h"] and positive_days >= settings["positive_days"]:
            if current is None:
                current = {"detector": "chronic", "onset": excursion_start,
                           "detected": row["local_date"], "last": row["local_date"]}
                candidates.append(current)
            else:
                current["last"] = row["local_date"]
        elif value <= settings["h"]:
            current = None
    return candidates


def data_issue_candidates(table: pd.DataFrame, settings: dict) -> list[dict]:
    days = development_days(table)
    candidates = []
    run_dates = []
    current = None
    for _, row in days.iterrows():
        reason = row["not_scored_reason"] if isinstance(row["not_scored_reason"], str) else ""
        is_data_issue = (not row["scored"]) and any(code in reason for code in DATA_ISSUE_REASONS)
        if not is_data_issue:
            run_dates, current = [], None
            continue
        run_dates.append(row["local_date"])
        if current is not None:
            current["last"] = row["local_date"]
        elif len(run_dates) >= settings["consecutive_days"]:
            current = {"detector": "data_quality", "onset": run_dates[0],
                       "detected": row["local_date"], "last": row["local_date"]}
            candidates.append(current)
    return candidates


def merge_into_cases(acute: list[dict], chronic: list[dict], data_issues: list[dict]) -> list[dict]:
    """Overlapping acute and chronic candidates become one consumption case; data issues stay apart."""
    cases = []
    for candidate in sorted(acute + chronic, key=lambda c: (c["onset"], c["detector"])):
        previous = cases[-1] if cases else None
        if previous is not None and candidate["onset"] <= previous["last"]:
            if candidate["detector"] not in previous["detectors"]:
                previous["detectors"] = sorted(previous["detectors"] + [candidate["detector"]])
            previous["detected"] = min(previous["detected"], candidate["detected"])
            previous["last"] = max(previous["last"], candidate["last"])
            continue
        cases.append({"kind": "consumption_deviation", "detectors": [candidate["detector"]],
                      "onset": candidate["onset"], "detected": candidate["detected"], "last": candidate["last"]})
    for candidate in data_issues:
        cases.append({"kind": "data_issue", "detectors": ["data_quality"], "onset": candidate["onset"],
                      "detected": candidate["detected"], "last": candidate["last"]})
    return cases
