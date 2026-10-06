"""Describe the Dataport metadata of our households and check its circuit flags.

Questions:
1. What does the metadata say about the households in the 15-minute file (building type,
   construction year, floor area, PV capacity, EV, other Dataport data streams)?
2. Do the metadata circuit flags ("yes") agree with the channels that have values in
   the train window (local dates 2018-01-01 to 2018-06-01)?

A metadata flag describes a circuit configured for the home at some time; it does not
promise data in 2018. Rows outside the train window are dropped right after timestamp
parsing, so test-period readings never enter a calculation.

Run from the repository root with the installed silentwatt_ml package:

    .venv/bin/python docs/product/ekler/review_metadata_consistency.py \
        --data-dir ../dataset --config configs/ml/austin-2018.json \
        > artifacts/data-review-2026-09-27/metadata-consistency.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from silentwatt_ml.config import ProjectConfig, load_config
from silentwatt_ml.data.quality import electric_timestamps
from silentwatt_ml.data.readers import require_files, sha256_file

METADATA_FILENAME = "metadata_pecanstreetdata.csv"


def train_window_presence(path: Path, config: ProjectConfig) -> pd.DataFrame:
    """Per household and channel: does the channel have any value in the train window?"""
    household_column = config.columns["household_id"]
    time_column = config.columns["timestamp_15m"]
    train_start, train_end = (pd.Timestamp(day, tz=config.timezone)
                              for day in config.raw["splits_local_date"]["train"])
    value_counts = []
    for chunk in pd.read_csv(path, chunksize=250_000):
        timestamps = electric_timestamps(chunk[time_column])
        # Test-period rows are dropped here, before any value is looked at.
        in_train = timestamps.ge(train_start) & timestamps.lt(train_end)
        kept = chunk.loc[in_train].drop(columns=[time_column])
        value_counts.append(kept.groupby(household_column).count())
    counts = pd.concat(value_counts).groupby(level=0).sum()
    return counts > 0


def describe_households(metadata: pd.DataFrame) -> dict:
    """Summarise the metadata columns that matter for the scope proposal."""
    construction_year = pd.to_numeric(metadata["house_construction_year"], errors="coerce")
    floor_area = pd.to_numeric(metadata["total_square_footage"], errors="coerce")
    pv_capacity = pd.to_numeric(metadata["total_amount_of_pv"], errors="coerce")
    city_state_counts = metadata.groupby(["city", "state"]).size()
    return {
        "households": int(len(metadata)),
        "city_state": [{"city": city, "state": state, "households": int(count)}
                       for (city, state), count in city_state_counts.items()],
        "building_type": metadata["building_type"].value_counts().to_dict(),
        "construction_year": {"min": int(construction_year.min()),
                              "median": float(construction_year.median()),
                              "max": int(construction_year.max()),
                              "built_2007_to_2010": int(construction_year.between(2007, 2010).sum())},
        "total_square_footage": {"min": float(floor_area.min()), "max": float(floor_area.max())},
        "pv_flag_yes": int(metadata["pv"].eq("yes").sum()),
        "pv_capacity_kw": {"households_with_value": int(pv_capacity.notna().sum()),
                           "min": float(pv_capacity.min()), "max": float(pv_capacity.max())},
        "ev_flag_yes": int(metadata["car1"].eq("yes").sum()),
        "indoor_temperature_listed": sorted(
            int(h) for h in metadata.loc[metadata["indoor_temp_data_availability"].notna(), "dataid"]),
        "gas_data_listed": int(metadata["gas_data_availability"].notna().sum()),
        "nest_thermostats_listed": sorted(
            int(h) for h in metadata.loc[metadata["number_of_nests"].notna(), "dataid"]),
    }


def compare_flags_with_data(metadata: pd.DataFrame, presence: pd.DataFrame) -> dict:
    """Count household-channel pairs where the metadata flag and the train data agree."""
    channels = [c for c in presence.columns if c in metadata.columns]
    flags = metadata.set_index("dataid")
    agreeing = 0
    mismatches = []
    for household in presence.index:
        for channel in channels:
            flagged = flags.loc[household, channel] == "yes"
            has_values = bool(presence.loc[household, channel])
            if flagged == has_values:
                agreeing += 1
            elif flagged:
                mismatches.append({"household_id": int(household), "channel": channel,
                                   "kind": "flag_yes_but_no_train_values"})
            else:
                mismatches.append({"household_id": int(household), "channel": channel,
                                   "kind": "train_values_but_no_flag"})
    by_household = pd.Series([m["household_id"] for m in mismatches]).value_counts()
    return {
        "channels_compared": len(channels),
        "pairs_compared": agreeing + len(mismatches),
        "pairs_agreeing": agreeing,
        "mismatches": mismatches,
        "mismatches_by_household": {int(h): int(n) for h, n in by_household.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Dataport metadata summary and flag check.")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--config", default="configs/ml/austin-2018.json")
    parser.add_argument("--metadata", help=f"Defaults to <data-dir>/{METADATA_FILENAME}")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    sources = require_files(data_dir, {"electric_15m": config.files["electric_15m"]})
    metadata_path = Path(args.metadata) if args.metadata else data_dir / METADATA_FILENAME
    all_metadata = pd.read_csv(metadata_path, dtype=str, low_memory=False)
    all_metadata["dataid"] = pd.to_numeric(all_metadata["dataid"])

    presence = train_window_presence(sources["electric_15m"], config)
    our_households = sorted(int(h) for h in presence.index)
    ours = all_metadata.loc[all_metadata["dataid"].isin(our_households)]
    missing = sorted(set(our_households) - set(int(h) for h in ours["dataid"]))

    report = {
        "question": "Dataport metadata of our households; do circuit flags match the data?",
        "window_for_data_presence": {"split": "train",
                                     "local_dates": config.raw["splits_local_date"]["train"]},
        "metadata_file": {"name": metadata_path.name, "sha256": sha256_file(metadata_path),
                          "rows": int(len(all_metadata)),
                          "columns": int(all_metadata.shape[1]),
                          "unique_households": int(all_metadata["dataid"].nunique())},
        "our_households": our_households,
        "our_households_missing_from_metadata": missing,
        "description": describe_households(ours),
        "flag_check": compare_flags_with_data(ours, presence.loc[our_households]),
        "source_sha256": {"electric_15m": sha256_file(sources["electric_15m"])},
    }
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
