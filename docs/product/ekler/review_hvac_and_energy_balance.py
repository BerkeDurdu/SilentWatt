"""Train-only evidence for channel identity (D-03) and the scope proposal (Q-13).

Five descriptive checks on the train window (local dates 2018-01-01 to 2018-06-01):

1. Channel availability: households with values per channel, and PV households that
   actually produce.
2. Energy balance: share of household use (grid + solar) covered by the monitored circuits.
3. HVAC pairing: how often furnace1 runs while air1 runs.
4. Cold and warm weather: does air1 run in cold weather (a possible heat pump) and is
   furnace1 large in cold weather (possible electric resistance heat)?
5. Negative values in the net and generation channels: grid export and solar at night.

The activity thresholds below are exploratory, in source units, and describe the data;
they are not quality rules and do not change the config.

Rows outside the train window are dropped right after timestamp parsing, before any
value is used, so test-period readings never enter a calculation.

Run from the repository root with the installed silentwatt_ml package:

    .venv/bin/python docs/product/ekler/review_hvac_and_energy_balance.py \
        --data-dir ../dataset --config configs/ml/austin-2018.json \
        > artifacts/data-review-2026-09-27/hvac-and-energy-balance.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from silentwatt_ml.config import ProjectConfig, load_config
from silentwatt_ml.data.quality import electric_timestamps, weather_frame
from silentwatt_ml.data.readers import require_files
from silentwatt_ml.provenance import provenance

# Columns that are not household circuits: net grid flow, PV generation and supply voltages.
NON_CIRCUIT_COLUMNS = {"grid", "solar", "solar2", "leg1v", "leg2v", "battery1"}
# A PV household must produce more than this at least once; an all-zero channel is not PV.
PV_PRODUCTION_MINIMUM = 0.1
COMPRESSOR_ON = 0.5        # air1 above this: the compressor is running
FAN_ON = 0.1               # furnace1 above this: the air handler fan is running
AIR1_ACTIVE = 0.3          # air1 above this counts as active in the cold/warm comparison
COLD_BELOW_C = 5.0
WARM_ABOVE_C = 27.0
# Hours that are dark or bright in Austin throughout January-May, so no season shifts them.
NIGHT_CORE_LOCAL_HOURS = [21, 22, 23, 0, 1, 2, 3, 4]
MIDDAY_CORE_LOCAL_HOURS = [10, 11, 12, 13, 14]


def read_train_window(path: Path, config: ProjectConfig) -> pd.DataFrame:
    """Read every column of the 15-minute file for the train window only."""
    time_column = config.columns["timestamp_15m"]
    train_start, train_end = (pd.Timestamp(day, tz=config.timezone)
                              for day in config.raw["splits_local_date"]["train"])
    kept_parts = []
    for chunk in pd.read_csv(path, chunksize=250_000):
        timestamps = electric_timestamps(chunk[time_column])
        # Test-period rows are dropped here, before any value is looked at.
        in_train = timestamps.ge(train_start) & timestamps.lt(train_end)
        kept = chunk.loc[in_train].drop(columns=[time_column])
        kept["ts_utc"] = timestamps.loc[in_train]
        kept_parts.append(kept)
    return pd.concat(kept_parts, ignore_index=True)


def channel_availability(frame: pd.DataFrame, household_column: str,
                         circuits: list[str]) -> dict:
    """Households with values per channel, and households whose PV actually produces."""
    values_present = frame.groupby(household_column).count()
    availability = []
    for channel in [*circuits, "grid", "solar"]:
        households = int((values_present[channel] > 0).sum())
        if households:
            availability.append({"channel": channel, "households_with_values": households})
    availability.sort(key=lambda row: (-row["households_with_values"], row["channel"]))

    solar_maximum = frame.groupby(household_column)["solar"].max()
    producing = solar_maximum[solar_maximum > PV_PRODUCTION_MINIMUM].index
    circuits_per_home = (values_present[circuits] > 0).sum(axis=1)
    return {
        "channels": availability,
        "pv_households_producing": sorted(int(h) for h in producing),
        "circuits_with_values_per_household": {
            "median": float(circuits_per_home.median()),
            "min": int(circuits_per_home.min()),
            "max": int(circuits_per_home.max()),
        },
    }


def energy_balance(frame: pd.DataFrame, household_column: str, circuits: list[str],
                   solar_households: set[int]) -> dict:
    """Share of household use (grid + solar) that the monitored circuits account for."""
    households = []
    for household, group in frame.groupby(household_column):
        # grid is the net flow, so household use is grid plus own PV production.
        if household in solar_households:
            use = group["grid"] + group["solar"]
        else:
            use = group["grid"]
        valid = use.notna()
        circuit_total = group.loc[valid, circuits].sum(axis=1, min_count=1).sum()
        use_total = float(use[valid].sum())
        share = float(circuit_total) / use_total if use_total > 0 else None
        households.append({"household_id": int(household),
                           "monitored_share": None if share is None else round(share, 3)})
    shares = pd.Series([h["monitored_share"] for h in households
                        if h["monitored_share"] is not None])
    return {
        "households": households,
        "median": round(float(shares.median()), 3),
        "p10": round(float(shares.quantile(0.10)), 3),
        "p90": round(float(shares.quantile(0.90)), 3),
        "min": round(float(shares.min()), 3),
        "max": round(float(shares.max()), 3),
    }


def hvac_pairing(frame: pd.DataFrame, household_column: str) -> dict:
    """While the compressor (air1) runs, how often does the air handler (furnace1) run too?"""
    both_present = frame.dropna(subset=["air1", "furnace1"])
    compressor_running = both_present.loc[both_present["air1"] > COMPRESSOR_ON]
    shares = {}
    for household, group in compressor_running.groupby(household_column):
        shares[int(household)] = round(float((group["furnace1"] > FAN_ON).mean()), 3)
    share_series = pd.Series(shares)
    return {
        "fan_running_share_by_household": shares,
        "households": int(share_series.size),
        "median": round(float(share_series.median()), 3),
        "mean": round(float(share_series.mean()), 3),
        "p10": round(float(share_series.quantile(0.10)), 3),
        "min": round(float(share_series.min()), 3),
    }


def cold_and_warm_behaviour(frame: pd.DataFrame, household_column: str) -> list[dict]:
    """air1 activity and furnace1 level in cold versus warm hours, per household."""
    rows = []
    for household, group in frame.groupby(household_column):
        if group["air1"].count() == 0:
            continue
        cold = group.loc[group["temperature_c"] < COLD_BELOW_C]
        warm = group.loc[group["temperature_c"] > WARM_ABOVE_C]
        rows.append({
            "household_id": int(household),
            "air1_active_share_cold": round(float((cold["air1"].dropna() > AIR1_ACTIVE).mean()), 3),
            "air1_active_share_warm": round(float((warm["air1"].dropna() > AIR1_ACTIVE).mean()), 3),
            "furnace1_p95_cold": None if cold["furnace1"].count() == 0
            else round(float(cold["furnace1"].quantile(0.95)), 3),
            "furnace1_p95_warm": None if warm["furnace1"].count() == 0
            else round(float(warm["furnace1"].quantile(0.95)), 3),
            "cold_slots": int(len(cold)),
            "warm_slots": int(len(warm)),
        })
    return rows


def net_and_generation_negatives(frame: pd.DataFrame, household_column: str,
                                 pv_households: list[int], timezone: str) -> dict:
    """Where negative grid and solar values occur in PV households."""
    in_pv_home = frame[household_column].isin(pv_households)
    local_hour = frame["ts_utc"].dt.tz_convert(timezone).dt.hour
    grid = frame.loc[in_pv_home, "grid"].dropna()
    solar_present = in_pv_home & frame["solar"].notna()
    night = solar_present & local_hour.isin(NIGHT_CORE_LOCAL_HOURS)
    midday = solar_present & local_hour.isin(MIDDAY_CORE_LOCAL_HOURS)
    return {
        "grid_negative_share": round(float((grid < 0).mean()), 3),
        "solar_negative_share": round(float((frame.loc[solar_present, "solar"] < 0).mean()), 3),
        "solar_negative_share_night_core": round(float((frame.loc[night, "solar"] < 0).mean()), 3),
        "solar_negative_share_midday_core": round(float((frame.loc[midday, "solar"] < 0).mean()), 3),
        "solar_minimum": round(float(frame.loc[solar_present, "solar"].min()), 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train-only HVAC and energy balance review.")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--config", default="configs/ml/austin-2018.json")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    sources = require_files(data_dir, {"electric_15m": config.files["electric_15m"],
                                       "weather": config.files["weather"]})
    household_column = config.columns["household_id"]

    frame = read_train_window(sources["electric_15m"], config)
    circuits = [c for c in frame.columns
                if c not in NON_CIRCUIT_COLUMNS | {household_column, "ts_utc"}]
    # Hourly temperature is joined to the same UTC hour, as in the P1 pipeline.
    _, weather = weather_frame(sources["weather"], config)
    frame["weather_ts_utc"] = frame["ts_utc"].dt.floor("h")
    frame = frame.merge(weather, on="weather_ts_utc", how="left", validate="many_to_one")

    availability = channel_availability(frame, household_column, circuits)
    households_reporting_solar = set(
        int(h) for h, n in frame.groupby(household_column)["solar"].count().items() if n > 0)
    report = {
        "question": "D-03 channel identity and Q-13 scope inputs",
        "window": {"split": "train",
                   "local_dates": config.raw["splits_local_date"]["train"]},
        "train_rows": int(len(frame)),
        "thresholds_source_units": {
            "pv_production_minimum": PV_PRODUCTION_MINIMUM, "compressor_on": COMPRESSOR_ON,
            "fan_on": FAN_ON, "air1_active": AIR1_ACTIVE,
            "cold_below_c": COLD_BELOW_C, "warm_above_c": WARM_ABOVE_C,
        },
        "availability": availability,
        "energy_balance": energy_balance(frame, household_column, circuits,
                                         households_reporting_solar),
        "hvac_pairing": hvac_pairing(frame, household_column),
        "cold_and_warm": cold_and_warm_behaviour(frame, household_column),
        "net_and_generation_negatives": net_and_generation_negatives(
            frame, household_column, availability["pv_households_producing"], config.timezone),
        "provenance": provenance(config, sources),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
