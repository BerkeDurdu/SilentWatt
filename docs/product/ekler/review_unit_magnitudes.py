"""Train-only evidence for the source unit question (D-01); changes no data or rule.

Two checks on the train window (local dates 2018-01-01 to 2018-06-01):

1. Channel magnitudes: per household, the 99th percentile and the maximum of selected
   channels. Read as kW interval means, they can be compared with known appliance ratings.
2. PV capacity ratio: the 99.9th percentile of `solar` divided by the PV capacity recorded
   in the Dataport metadata (`total_amount_of_pv`, kW). If the values are kW interval
   means, the ratio is expected around 0.6-0.9; kWh per 15 minutes would give about a
   quarter of that, and watts would give less than 0.001.

Rows outside the train window are dropped right after timestamp parsing, before any
value is used, so test-period (August-December) readings never enter a calculation.

Run from the repository root with the installed silentwatt_ml package. JSON goes to
stdout; keep the report in a new artifacts/ directory:

    .venv/bin/python docs/product/ekler/review_unit_magnitudes.py \
        --data-dir ../dataset --config configs/ml/austin-2018.json \
        > artifacts/data-review-2026-09-27/unit-magnitudes.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from silentwatt_ml.config import ProjectConfig, load_config
from silentwatt_ml.data.quality import electric_timestamps
from silentwatt_ml.data.readers import require_files, sha256_file
from silentwatt_ml.provenance import provenance

MAGNITUDE_CHANNELS = ["air1", "furnace1", "refrigerator1", "solar", "grid", "car1",
                      "drye1", "dishwasher1", "microwave1"]
METADATA_FILENAME = "metadata_pecanstreetdata.csv"


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


def channel_magnitudes(frame: pd.DataFrame, household_column: str) -> list[dict]:
    """For each channel, how large the values are in the households that report it."""
    summaries = []
    for channel in MAGNITUDE_CHANNELS:
        values_by_home = frame.groupby(household_column)[channel]
        reports_channel = values_by_home.count() > 0
        home_p99 = values_by_home.quantile(0.99)[reports_channel]
        home_max = values_by_home.max()[reports_channel]
        summaries.append({
            "channel": channel,
            "households_with_values": int(reports_channel.sum()),
            "median_of_household_p99": round(float(home_p99.median()), 3),
            "largest_household_p99": round(float(home_p99.max()), 3),
            "largest_value": round(float(home_max.max()), 3),
        })
    return summaries


def pv_capacity_ratios(frame: pd.DataFrame, household_column: str,
                       metadata: pd.DataFrame) -> dict:
    """Compare the PV output peak of each household with its recorded PV capacity."""
    capacity_kw = pd.to_numeric(metadata.set_index("dataid")["total_amount_of_pv"],
                                errors="coerce")
    households = []
    for household, group in frame.groupby(household_column):
        solar = group["solar"].dropna()
        if solar.empty:
            continue
        capacity = capacity_kw.get(household)
        # The 99.9th percentile is used instead of the maximum so one spike cannot decide it.
        peak_output = float(solar.quantile(0.999))
        record = {
            "household_id": int(household),
            "capacity_kw_in_metadata": None if pd.isna(capacity) else float(capacity),
            "p999_output": round(peak_output, 3),
            "max_output": round(float(solar.max()), 3),
            "p999_to_capacity": None,
        }
        if pd.notna(capacity) and capacity > 0:
            record["p999_to_capacity"] = round(peak_output / float(capacity), 3)
        households.append(record)

    ratios = pd.Series([h["p999_to_capacity"] for h in households
                        if h["p999_to_capacity"] is not None])
    spikes_above_capacity = [
        h["household_id"] for h in households
        if h["capacity_kw_in_metadata"] is not None
        and h["max_output"] > h["capacity_kw_in_metadata"]
    ]
    return {
        "households": households,
        "households_with_capacity": int(len(ratios)),
        "ratio_median": round(float(ratios.median()), 3),
        "ratio_min": round(float(ratios.min()), 3),
        "ratio_max": round(float(ratios.max()), 3),
        "households_with_all_zero_output": [h["household_id"] for h in households
                                            if h["max_output"] == 0],
        "households_with_max_above_capacity": spikes_above_capacity,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train-only source unit evidence (D-01).")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--config", default="configs/ml/austin-2018.json")
    parser.add_argument("--metadata", help=f"Defaults to <data-dir>/{METADATA_FILENAME}")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    sources = require_files(data_dir, {"electric_15m": config.files["electric_15m"]})
    metadata_path = Path(args.metadata) if args.metadata else data_dir / METADATA_FILENAME
    metadata = pd.read_csv(metadata_path, dtype=str, low_memory=False)
    metadata["dataid"] = pd.to_numeric(metadata["dataid"])

    household_column = config.columns["household_id"]
    frame = read_train_window(sources["electric_15m"], config, MAGNITUDE_CHANNELS)
    report = {
        "question": "D-01: what is the unit of the electricity values?",
        "window": {"split": "train",
                   "local_dates": config.raw["splits_local_date"]["train"]},
        "train_rows": int(len(frame)),
        "households": int(frame[household_column].nunique()),
        "channel_magnitudes": channel_magnitudes(frame, household_column),
        "pv_capacity": pv_capacity_ratios(frame, household_column, metadata),
        "reading_guide": {
            "pv_ratio_if_kw_interval_mean": "about 0.6-0.9",
            "pv_ratio_if_kwh_per_15min": "about a quarter of the kW ratio",
            "pv_ratio_if_watts": "below 0.001",
        },
        "provenance": {**provenance(config, sources),
                       "metadata_file": metadata_path.name,
                       "metadata_sha256": sha256_file(metadata_path)},
    }
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
