"""Train-only evidence for the 15-minute interval meaning (D-02); changes no data or rule.

The 15-minute value is compared with the mean of the one-minute values under three
hypotheses about which minutes a 15-minute label covers:

    A  label t covers the minutes t .. t+14   (label = interval start)
    B  label t covers the minutes t-15 .. t-1 (label = interval end)
    C  label t covers the minutes t-14 .. t   (both files label the interval end)

Only windows with all 15 one-minute values present are compared. The hypothesis that
matches within rounding tolerance in every household tells us how the two files align.

Rows outside the train window (local dates 2018-01-01 to 2018-06-01) are dropped right
after timestamp parsing, before any value is used, so test-period readings never enter
a calculation. The one-minute file (about 2.6 GB) is read in chunks; this takes about a
minute.

Run from the repository root with the installed silentwatt_ml package:

    .venv/bin/python docs/product/ekler/review_resolution_alignment.py \
        --data-dir ../dataset --config configs/ml/austin-2018.json \
        > artifacts/data-review-2026-09-27/resolution-alignment.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from silentwatt_ml.config import ProjectConfig, load_config
from silentwatt_ml.data.quality import electric_timestamps
from silentwatt_ml.data.readers import require_files
from silentwatt_ml.provenance import provenance

ALIGNMENT_CHANNELS = ["air1", "furnace1", "refrigerator1", "solar", "grid", "car1"]
# Both files store values rounded to 0.001. The stored 15-minute value and the mean of
# 15 rounded minutes can therefore differ by up to 0.001 without any real disagreement.
ROUNDING_TOLERANCE = 0.0011


def read_train_window(path: Path, config: ProjectConfig, time_column: str) -> pd.DataFrame:
    """Read the household id and the alignment channels of one file, train window only."""
    household_column = config.columns["household_id"]
    train_start, train_end = (pd.Timestamp(day, tz=config.timezone)
                              for day in config.raw["splits_local_date"]["train"])
    kept_parts = []
    for chunk in pd.read_csv(path, usecols=[household_column, time_column, *ALIGNMENT_CHANNELS],
                             chunksize=1_000_000):
        timestamps = electric_timestamps(chunk[time_column])
        # Test-period rows are dropped here, before any value is looked at.
        in_train = timestamps.ge(train_start) & timestamps.lt(train_end)
        kept = chunk.loc[in_train, [household_column, *ALIGNMENT_CHANNELS]].copy()
        kept["ts_utc"] = timestamps.loc[in_train]
        kept_parts.append(kept)
    return pd.concat(kept_parts, ignore_index=True)


def window_labels(minute_timestamps: pd.Series) -> dict[str, pd.Series]:
    """For each hypothesis, the 15-minute label that every one-minute reading belongs to."""
    return {
        "A_label_is_start": minute_timestamps.dt.floor("15min"),
        "B_label_is_end_previous_quarter": minute_timestamps.dt.floor("15min")
        + pd.Timedelta(minutes=15),
        "C_both_files_label_the_end": minute_timestamps.dt.ceil("15min"),
    }


def compare_one_hypothesis(one_minute: pd.DataFrame, fifteen_minute: pd.DataFrame,
                           labels: pd.Series, household_column: str) -> list[dict]:
    """Compare stored 15-minute values with one-minute means under one hypothesis."""
    grouped = one_minute.assign(ts_utc=labels).groupby([household_column, "ts_utc"])
    minute_means = grouped[ALIGNMENT_CHANNELS].mean()
    minute_counts = grouped[ALIGNMENT_CHANNELS].count()
    stored = fifteen_minute.set_index([household_column, "ts_utc"])[ALIGNMENT_CHANNELS]

    results = []
    for channel in ALIGNMENT_CHANNELS:
        paired = pd.DataFrame({"stored_value": stored[channel]}).join(
            pd.DataFrame({"minute_mean": minute_means[channel],
                          "minutes_present": minute_counts[channel]}),
            how="inner")
        # A window with missing minutes is not a fair comparison, so only full windows count.
        complete = paired["minutes_present"].eq(15) & paired["stored_value"].notna()
        difference = (paired.loc[complete, "stored_value"]
                      - paired.loc[complete, "minute_mean"]).abs()
        if difference.empty:
            continue
        largest_difference_per_home = difference.groupby(level=household_column).max()
        results.append({
            "channel": channel,
            "households": int(largest_difference_per_home.size),
            "complete_windows": int(complete.sum()),
            "median_abs_difference": round(float(difference.median()), 6),
            "p99_abs_difference": round(float(difference.quantile(0.99)), 6),
            "max_abs_difference": round(float(difference.max()), 6),
            "share_within_tolerance": round(float((difference <= ROUNDING_TOLERANCE).mean()), 6),
            "households_exceeding_tolerance": int(
                (largest_difference_per_home > ROUNDING_TOLERANCE).sum()),
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Train-only 1-minute/15-minute alignment (D-02).")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--config", default="configs/ml/austin-2018.json")
    args = parser.parse_args()

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    sources = require_files(data_dir, {"electric_1m": config.files["electric_1m"],
                                       "electric_15m": config.files["electric_15m"]})
    household_column = config.columns["household_id"]
    one_minute = read_train_window(sources["electric_1m"], config, config.columns["timestamp_1m"])
    fifteen_minute = read_train_window(sources["electric_15m"], config,
                                       config.columns["timestamp_15m"])

    hypotheses = {}
    for name, labels in window_labels(one_minute["ts_utc"]).items():
        hypotheses[name] = compare_one_hypothesis(one_minute, fifteen_minute, labels,
                                                  household_column)

    report = {
        "question": "D-02: which minutes does a 15-minute value summarise?",
        "window": {"split": "train",
                   "local_dates": config.raw["splits_local_date"]["train"]},
        "train_rows": {"one_minute": int(len(one_minute)),
                       "fifteen_minute": int(len(fifteen_minute))},
        "rounding_tolerance": ROUNDING_TOLERANCE,
        "hypotheses": hypotheses,
        "limitation": ("The data cannot tell whether a one-minute label marks the start or "
                       "the end of its minute; that leaves at most a one-minute shift."),
        "provenance": provenance(config, sources),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
