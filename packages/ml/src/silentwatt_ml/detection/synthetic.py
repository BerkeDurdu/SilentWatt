"""Synthetic scenarios on a copy of one household's July (development) readings.

There are no labelled real faults, so the detector is tested on known injected changes:

- step_increase: readings above the running threshold are multiplied by 1 + severity.
- ramp_increase: the same readings are multiplied by a factor that grows linearly from 1 to
  1 + severity over the window.
- data_fault outage: every reading of the window is removed.
- data_fault freeze: every reading of the window repeats one positive value.
- data_fault spike: four fixed afternoon slots per day are set to ten times the reading.

Only the target column of a copy changes; June, the model and its band stay as they are, and
the source files are never touched. A window must lie inside the replay month.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from silentwatt_ml.data.daily import daily_quality

GENERATOR_VERSION = "synthetic-0.1"
# 14:00, 15:00, 16:00 and 17:00 local, when an air conditioner usually runs.
SPIKE_SLOT_INDEXES = (56, 60, 64, 68)
SPIKE_FACTOR = 10.0


def scenario_dates(scenario: dict) -> list[str]:
    start = date.fromisoformat(scenario["start_local_date"])
    return [(start + timedelta(days=offset)).isoformat() for offset in range(scenario["duration_days"])]


def inject(slots: pd.DataFrame, scenario: dict, running_threshold: float) -> pd.DataFrame:
    """A copy of one household's development slots with the scenario applied to target."""
    slots = slots.sort_values("ts_utc").reset_index(drop=True).copy()
    dates = scenario_dates(scenario)
    replay_dates = set(slots.loc[slots["split"].eq("development"), "local_date"])
    if not set(dates) <= replay_dates:
        raise ValueError(f"Scenario window {dates[0]}..{dates[-1]} must lie inside the replay window")
    inside = slots["local_date"].isin(dates)
    running = inside & slots["target"].gt(running_threshold)

    kind = scenario["scenario"]
    if kind == "step_increase":
        slots.loc[running, "target"] = slots.loc[running, "target"] * (1 + scenario["severity"])
    elif kind == "ramp_increase":
        # Progress through the window in time, 0 at its first slot and almost 1 at its last.
        window_start = pd.Timestamp(slots.loc[inside, "ts_utc"].min())
        window_length = pd.Timedelta(days=scenario["duration_days"])
        progress = (pd.to_datetime(slots.loc[running, "ts_utc"], utc=True) - window_start) / window_length
        slots.loc[running, "target"] = slots.loc[running, "target"] * (1 + scenario["severity"] * progress)
    elif kind == "data_fault":
        _apply_data_fault(slots, inside, running, scenario["fault_kind"], running_threshold)
    else:
        raise ValueError(f"Unknown scenario: {kind}")
    return slots


def _apply_data_fault(slots: pd.DataFrame, inside: pd.Series, running: pd.Series,
                      fault_kind: str, running_threshold: float) -> None:
    if fault_kind == "outage":
        slots.loc[inside, "target"] = np.nan
    elif fault_kind == "freeze":
        # A stuck sensor repeats one plausible running value; with no running reading,
        # twice the running threshold keeps the value clearly positive.
        running_values = slots.loc[running, "target"]
        stuck_value = float(running_values.median()) if len(running_values) else 2 * running_threshold
        slots.loc[inside, "target"] = stuck_value
    elif fault_kind == "spike":
        slot_of_day = slots.groupby("local_date").cumcount()
        spiked = inside & slot_of_day.isin(SPIKE_SLOT_INDEXES)
        base = slots.loc[spiked, "target"].clip(lower=running_threshold)
        slots.loc[spiked, "target"] = SPIKE_FACTOR * base
    else:
        raise ValueError(f"Unknown data fault: {fault_kind}")


def requalify(slots: pd.DataFrame, temperature_range: tuple[float, float], timezone: str,
              daily_settings: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Run the P1 daily quality gate again on injected readings.

    Returns the slots with recomputed eligibility and the daily-quality rows of the month.
    A slot still needs a calibrated band to be scored.
    """
    frame = slots[["ts_utc", "target", "temperature_c", "local_date", "target_quality"]].copy()
    frame["ts_utc"] = pd.to_datetime(frame["ts_utc"], utc=True)
    # Readings removed by an injection count as null targets, as a missing source value would.
    removed = frame["target"].isna() & frame["target_quality"].isin(["ok", "dead_band"])
    frame.loc[removed, "target_quality"] = "null_target"
    frame = frame.sort_values("ts_utc").reset_index(drop=True)
    qualified, days = daily_quality(frame, timezone, daily_settings, temperature_range)

    gate_columns = ["frozen_suspected", "out_of_support", "slot_valid", "slot_supported", "day_eligible", "eligible"]
    result = slots.drop(columns=[c for c in gate_columns if c in slots.columns]).copy()
    result["ts_utc"] = pd.to_datetime(result["ts_utc"], utc=True)
    result = result.merge(qualified[["ts_utc", *gate_columns]], on="ts_utc", how="left", validate="one_to_one")
    has_band = np.isfinite(result["q50"]) & np.isfinite(result["lower"]) & np.isfinite(result["upper"])
    result["eligible"] = result["eligible"].fillna(False).astype(bool) & has_band
    days = days.assign(split="development")
    return result, days[["local_date", "split", "expected_slots", "valid_joint_slots", "day_eligible", "reasons"]]
