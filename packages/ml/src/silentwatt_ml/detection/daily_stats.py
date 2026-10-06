"""Daily statistics of one household for the detector.

The detector reads the calibrated band of a P1 run. For each local day only the slots that
passed the daily quality gate and have a calibrated band count; call them the used slots:

    observed_unit_hours  = 0.25 * sum(target)   over the used slots
    reference_unit_hours = 0.25 * sum(q50)      over the used slots (the model reference)
    residual_unit_hours  = observed - reference
    upper_exceedance     = share of used slots with target above the upper bound

Unit-hours are source unit x hours. The unit is unverified, so they are never called kWh.
The daily z compares a day's residual with June (calibration) days of the same household.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

SLOT_HOURS = 0.25
TABLE_COLUMNS = [
    "local_date", "split", "scored", "not_scored_reason", "expected_slots", "valid_slots",
    "used_slots", "upper_exceedance_slots", "observed_unit_hours", "reference_unit_hours",
    "residual_unit_hours", "excess_share", "upper_exceedance_share", "max_temperature_c",
]


def household_daily_table(slots: pd.DataFrame, days: pd.DataFrame, excess_reference_floor: float) -> pd.DataFrame:
    """One row per local day of one household and one model, in date order.

    slots: prediction rows (local_date, target, q50, upper, eligible, temperature_c).
    days: daily-quality rows of the same household (local_date, split, expected_slots,
          valid_joint_slots, day_eligible, reasons).
    excess_reference_floor: below this reference (unit-hours) a share would be meaningless.
    """
    # 1. Used slots: daily gate passed, finite reading and a calibrated band.
    used = (slots["eligible"].astype(bool) & np.isfinite(slots["target"])
            & np.isfinite(slots["q50"]) & np.isfinite(slots["upper"]))
    used_slots = slots.loc[used].copy()
    used_slots["above_upper"] = used_slots["target"] > used_slots["upper"]
    per_day = used_slots.groupby("local_date").agg(
        used_slots=("target", "size"),
        observed_sum=("target", "sum"),
        reference_sum=("q50", "sum"),
        upper_exceedance_slots=("above_upper", "sum"),
    ).reset_index()
    temperature = slots.groupby("local_date")["temperature_c"].max().rename("max_temperature_c").reset_index()

    # 2. Join with the daily gate, so every day appears even without used slots.
    table = days[["local_date", "split", "expected_slots", "valid_joint_slots", "day_eligible", "reasons"]].copy()
    table = table.merge(per_day, on="local_date", how="left").merge(temperature, on="local_date", how="left")
    table["used_slots"] = table["used_slots"].fillna(0).astype(int)
    table["upper_exceedance_slots"] = table["upper_exceedance_slots"].fillna(0).astype(int)
    table["valid_slots"] = table["valid_joint_slots"].astype(int)

    # 3. A day is scored when it passed the daily gate and has used slots.
    table["scored"] = table["day_eligible"].astype(bool) & table["used_slots"].gt(0)
    no_band = table["day_eligible"].astype(bool) & ~table["scored"]
    table["not_scored_reason"] = table["reasons"].where(~table["day_eligible"].astype(bool))
    table.loc[no_band, "not_scored_reason"] = "no_calibrated_band"
    table.loc[table["scored"], "not_scored_reason"] = None

    # 4. Daily sums and shares; unscored days keep NaN, which is written as null.
    scored = table["scored"]
    table["observed_unit_hours"] = (SLOT_HOURS * table["observed_sum"]).where(scored)
    table["reference_unit_hours"] = (SLOT_HOURS * table["reference_sum"]).where(scored)
    table["residual_unit_hours"] = table["observed_unit_hours"] - table["reference_unit_hours"]
    table["upper_exceedance_share"] = (table["upper_exceedance_slots"] / table["used_slots"]).where(scored)
    above_floor = table["reference_unit_hours"] >= excess_reference_floor
    table["excess_share"] = (table["observed_unit_hours"] / table["reference_unit_hours"] - 1).where(scored & above_floor)
    return table[TABLE_COLUMNS].sort_values("local_date").reset_index(drop=True)


def june_reference(table: pd.DataFrame, minimum_days: int, scale_floor: float) -> dict | None:
    """Median and robust scale of the daily residual over scored June (calibration) days.

    Returns None when June has too few scored days; the detector then publishes nothing for
    the household instead of guessing a scale.
    """
    june = table.loc[table["split"].eq("calibration") & table["scored"]]
    if len(june) < minimum_days:
        return None
    residuals = june["residual_unit_hours"]
    median = float(residuals.median())
    mad = float((residuals - median).abs().median())
    # 1.4826 turns the MAD into a standard-deviation estimate for normal noise; the floor
    # keeps a near-constant June from producing huge z values.
    scale = max(1.4826 * mad, scale_floor)
    return {"median": median, "scale": scale, "days": int(len(june))}


def add_z(table: pd.DataFrame, reference: dict) -> pd.DataFrame:
    """Daily z of the residual against the June reference; NaN on unscored days."""
    table = table.copy()
    z = (table["residual_unit_hours"] - reference["median"]) / reference["scale"]
    table["z"] = z.where(table["scored"])
    return table
