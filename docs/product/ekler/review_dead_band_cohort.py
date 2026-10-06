"""Train-only evidence for the negative-value rule (D-04) and the freeze rule (Q-01).

Changes no data, config or rule. For every household it compares the current rule with
a symmetric dead band around zero:

- Current rule: an air1 reading below 0 is invalid. A run of 16 identical positive
  readings (4 hours) is a freeze suspicion and blocks the whole local day.
- Dead band of width epsilon: a reading with |air1| <= epsilon is the "off" state and is
  set to 0 for this comparison; a reading below -epsilon stays invalid. The freeze rule
  only follows positive readings, so an "off" reading can no longer start a freeze run.

Why: the 2026-09-22 note found that most negatives are one or two resolution steps below
zero and that households record the same "off" state at different levels (-0.001, 0,
+0.004). Under the current rule a sensor that rests just below zero loses its off periods,
while a sensor that rests just above zero can trip the freeze rule.

Reported per household and rule: training coverage (the cohort rule), candidate status,
and how many train days pass the daily coverage and freeze gates. Temperature has no
missing hour, so the weather part of the daily gate is not repeated here.

Rows outside the train window are dropped right after timestamp parsing, before any
value is used, so test-period (August-December) readings never enter a calculation.

Run from the repository root with the installed silentwatt_ml package. JSON goes to
stdout; keep the report in a new artifacts/ directory:

    .venv/bin/python docs/product/ekler/review_dead_band_cohort.py \
        --data-dir ../dataset --config configs/ml/austin-2018.json \
        --p0-diagnostics artifacts/p0-2026-09-17/cohort-diagnostics.json \
        > artifacts/data-review-2026-10-05/dead-band-cohort.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig, load_config
from silentwatt_ml.data.daily import freeze_flags
from silentwatt_ml.data.quality import electric_timestamps
from silentwatt_ml.data.readers import require_files
from silentwatt_ml.provenance import provenance

# Dead band widths in source units. The smallest step between readings is 0.001.
DEAD_BAND_WIDTHS = [0.005, 0.01]
# Readings this close to zero describe where a sensor rests while the unit is off.
OFF_STATE_WINDOW = 0.02


def read_train_window(path: Path, config: ProjectConfig, channels: list[str]) -> pd.DataFrame:
    """Read the household id and the given channels of the 15-minute file, train window only."""
    household_column = config.columns["household_id"]
    time_column = config.columns["timestamp_15m"]
    train_start, train_end = (pd.Timestamp(day, tz=config.timezone)
                              for day in config.raw["splits_local_date"]["train"])
    kept_parts = []
    for chunk in pd.read_csv(path, usecols=[household_column, time_column, *channels],
                             chunksize=250_000):
        timestamps = electric_timestamps(chunk[time_column])
        # Test-period rows are dropped here, before any value is looked at.
        in_train = timestamps.ge(train_start) & timestamps.lt(train_end)
        kept = chunk.loc[in_train, [household_column, *channels]].copy()
        kept["ts_utc"] = timestamps.loc[in_train]
        kept_parts.append(kept)
    return pd.concat(kept_parts, ignore_index=True)


def train_grid(config: ProjectConfig) -> pd.DatetimeIndex:
    """All 15-minute UTC slots of the train window; DST days get 92 or 100 slots by themselves."""
    train_start, train_end = (pd.Timestamp(day, tz=config.timezone)
                              for day in config.raw["splits_local_date"]["train"])
    return pd.date_range(train_start.tz_convert("UTC"), train_end.tz_convert("UTC"),
                         freq="15min", inclusive="left")


def apply_rule(readings: pd.Series, dead_band: float | None) -> pd.Series:
    """Return the air1 values a rule accepts; NaN marks an invalid or missing slot."""
    numeric = pd.to_numeric(readings, errors="coerce")
    finite = numeric.where(np.isfinite(numeric))
    if dead_band is None:
        # Current rule (quality.valid_target): every negative reading is invalid.
        return finite.where(finite >= 0)
    # Readings further below zero than the dead band stay invalid.
    accepted = finite.where(finite >= -dead_band)
    # Readings inside the dead band are the "off" state. NaN is never inside the band.
    inside_band = accepted.abs().le(dead_band)
    return accepted.mask(inside_band, 0.0)


def rule_summary(readings: pd.Series, grid: pd.DatetimeIndex, config: ProjectConfig,
                 dead_band: float | None) -> dict:
    """Training coverage and daily gates of one household under one rule."""
    values = apply_rule(readings, dead_band)
    frame = pd.DataFrame({"ts_utc": grid, "target": values.to_numpy()})
    daily_settings = config.raw["p1"]["daily_quality"]
    # The package freeze rule counts runs of identical positive values, so 0 never starts one.
    frozen = freeze_flags(frame, daily_settings["frozen_run_slots"])
    valid = frame["target"].notna()

    slots = pd.DataFrame({"local_date": grid.tz_convert(config.timezone).date,
                          "valid": valid.to_numpy(), "frozen": frozen.to_numpy()})
    days = slots.groupby("local_date").agg(expected=("valid", "size"),
                                           valid=("valid", "sum"),
                                           frozen=("frozen", "sum"))
    coverage_ok = days["valid"] / days["expected"] >= daily_settings["minimum_coverage"]
    freeze_ok = days["frozen"].eq(0)
    if not daily_settings["block_frozen_days"]:
        freeze_ok = pd.Series(True, index=days.index)

    valid_count = int(valid.sum())
    return {
        "valid_training_slots": valid_count,
        "training_coverage": round(valid_count / len(grid), 4),
        "meets_training_coverage": valid_count / len(grid)
        >= config.raw["cohort"]["minimum_target_coverage"],
        "frozen_slots": int(frozen.sum()),
        "train_days": int(len(days)),
        "days_below_daily_coverage": int((~coverage_ok).sum()),
        "days_with_freeze_suspicion": int((~freeze_ok).sum()),
        "eligible_train_days": int((coverage_ok & freeze_ok).sum()),
    }


def off_state_level(readings: pd.Series) -> dict:
    """Where the sensor rests near zero, and how many readings are far below zero."""
    numeric = pd.to_numeric(readings, errors="coerce")
    near_zero = numeric[numeric.abs() <= OFF_STATE_WINDOW]
    if near_zero.empty:
        return {"near_zero_readings": 0}
    return {
        "near_zero_readings": int(len(near_zero)),
        "median": round(float(near_zero.median()), 4),
        "p05": round(float(near_zero.quantile(0.05)), 4),
        "p95": round(float(near_zero.quantile(0.95)), 4),
        "readings_below_minus_0_01": int((numeric < -0.01).sum()),
    }


def review(config: ProjectConfig, frame: pd.DataFrame, p0_valid_slots: dict[int, int] | None) -> dict:
    household_column = config.columns["household_id"]
    target_column = config.columns["target"]
    exclusion_channels = config.raw["cohort"]["exclude_if_observed"]
    grid = train_grid(config)
    rules = {"current": None, **{f"dead_band_{width}": width for width in DEAD_BAND_WIDTHS}}

    households = []
    for household, group in frame.groupby(household_column):
        household_id = int(household)
        if group["ts_utc"].duplicated().any():
            raise ValueError(f"Duplicate train keys for {household_id}; use the package audit")
        readings = group.set_index("ts_utc")[target_column].reindex(grid)
        observed_channels = [c for c in exclusion_channels if group[c].notna().any()]
        record = {"household_id": household_id,
                  "observed_exclusion_channels": observed_channels,
                  "off_state": off_state_level(group[target_column]),
                  "rules": {}}
        for rule_name, dead_band in rules.items():
            summary = rule_summary(readings, grid, config, dead_band)
            summary["candidate"] = summary["meets_training_coverage"] and not observed_channels
            record["rules"][rule_name] = summary
        households.append(record)

    # The current rule must reproduce the P0 package audit, slot for slot.
    if p0_valid_slots is not None:
        for record in households:
            mine = record["rules"]["current"]["valid_training_slots"]
            if mine != p0_valid_slots[record["household_id"]]:
                raise ValueError(f"Current rule disagrees with P0 for {record['household_id']}")

    candidates_by_rule = {}
    for rule_name in rules:
        candidates = [h for h in households if h["rules"][rule_name]["candidate"]]
        eligible_days = [h["rules"][rule_name]["eligible_train_days"] for h in candidates]
        candidates_by_rule[rule_name] = {
            "count": len(candidates),
            "household_ids": [h["household_id"] for h in candidates],
            "fewest_eligible_train_days": min(eligible_days) if eligible_days else None,
            "total_eligible_train_days": int(sum(eligible_days)),
        }

    return {
        "question": "D-04 / Q-01: how do the negative-value and freeze rules shape the cohort?",
        "window": {"split": "train", "local_dates": config.raw["splits_local_date"]["train"]},
        "expected_training_slots": len(grid),
        "rules": {
            "current": "air1 < 0 invalid; 16 identical positive readings block the day",
            "dead_band_<epsilon>": "|air1| <= epsilon -> 0 (off); air1 < -epsilon invalid; "
                                   "freeze rule unchanged, so off readings cannot start a run",
        },
        "p0_valid_slots_reproduced": p0_valid_slots is not None,
        "households": households,
        "candidates_by_rule": candidates_by_rule,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train-only dead band and cohort evidence (D-04, Q-01).")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--config", default="configs/ml/austin-2018.json")
    parser.add_argument("--p0-diagnostics",
                        help="P0 cohort-diagnostics.json; if given, the current rule must match it")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    sources = require_files(data_dir, {"electric_15m": config.files["electric_15m"]})
    channels = list(dict.fromkeys([config.columns["target"],
                                   *config.raw["cohort"]["exclude_if_observed"]]))
    frame = read_train_window(sources["electric_15m"], config, channels)

    p0_valid_slots = None
    if args.p0_diagnostics:
        diagnostics = json.loads(Path(args.p0_diagnostics).read_text())
        p0_valid_slots = {h["household_id"]: h["valid_slots"] for h in diagnostics["households"]}

    report = review(config, frame, p0_valid_slots)
    report["provenance"] = provenance(config, sources)
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
