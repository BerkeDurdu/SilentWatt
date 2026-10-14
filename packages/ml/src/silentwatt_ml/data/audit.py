from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.data.quality import electric_timestamps, slot_mask, valid_target, weather_frame
from silentwatt_ml.data.readers import iter_electric, require_files
from silentwatt_ml.provenance import provenance


def training_cohort_record(training: pd.DataFrame, has_duplicates: bool,
                           config: ProjectConfig, expected: int) -> dict:
    """The same train-only eligibility contract for audit and P1 evaluation."""
    observed = [c for c in config.raw["cohort"]["exclude_if_observed"]
                if training[c].notna().any()]
    count = int(training["_target"].notna().sum())
    reasons = []
    if count / expected < config.raw["cohort"]["minimum_target_coverage"]:
        reasons.append("insufficient_valid_training_coverage")
    if observed:
        reasons.append("additional_cooling_channel_observed_in_training")
    if has_duplicates:
        reasons.append("duplicate_training_keys")
    return {"training_valid_target_slots": count,
            "training_valid_target_coverage": count / expected,
            "observed_training_exclusion_channels": observed,
            "candidate": not reasons, "exclusion_reasons": reasons}


def _profile_one_minute(path: Path, config: ProjectConfig) -> dict:
    """Integrity inventory of the 1-minute file: rows, keys, target validity and time range.

    The whole file is scanned for counts only; no 1-minute value enters any model.
    """
    columns = config.columns
    household_column = columns["household_id"]
    time_column = columns["timestamp_1m"]
    target_column = columns["target"]

    row_count = 0
    missing_household_rows = 0
    invalid_timestamp_rows = 0
    invalid_target_rows = 0
    off_grid_rows = 0
    # Timestamps per household as int64 nanoseconds, for an exact duplicate-key count.
    timestamps_by_household = defaultdict(list)
    for chunk in iter_electric(path, usecols=[household_column, time_column, target_column]):
        timestamps = electric_timestamps(chunk[time_column])
        row_count += len(chunk)
        missing_household_rows += int(chunk[household_column].isna().sum())
        invalid_timestamp_rows += int(timestamps.isna().sum())
        invalid_target_rows += int(valid_target(chunk[target_column], config.target_dead_band).isna().sum())
        off_minute_grid = timestamps.notna() & timestamps.ne(timestamps.dt.floor("min"))
        off_grid_rows += int(off_minute_grid.sum())
        for household, group in chunk.assign(_ts=timestamps).groupby(household_column):
            household_timestamps = group["_ts"].dropna().astype("int64").to_numpy()
            timestamps_by_household[str(household)].append(household_timestamps)

    duplicate_keys = 0
    first_timestamp = None
    last_timestamp = None
    for parts in timestamps_by_household.values():
        values = np.concatenate(parts)
        if not len(values):
            continue
        unique_values = np.unique(values)
        duplicate_keys += len(values) - len(unique_values)
        household_first = int(unique_values[0])
        household_last = int(unique_values[-1])
        first_timestamp = household_first if first_timestamp is None else min(first_timestamp, household_first)
        last_timestamp = household_last if last_timestamp is None else max(last_timestamp, household_last)

    first_timestamp_text = None
    if first_timestamp is not None:
        first_timestamp_text = pd.Timestamp(first_timestamp, tz="UTC").isoformat()
    last_timestamp_text = None
    if last_timestamp is not None:
        last_timestamp_text = pd.Timestamp(last_timestamp, tz="UTC").isoformat()
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "rows": row_count,
        "households": len(timestamps_by_household),
        "invalid_timestamp_rows": invalid_timestamp_rows,
        "missing_household_rows": missing_household_rows,
        "invalid_or_missing_target_rows": invalid_target_rows,
        "off_grid_rows": off_grid_rows,
        "duplicate_household_timestamp_keys": int(duplicate_keys),
        "first_timestamp_utc": first_timestamp_text,
        "last_timestamp_utc": last_timestamp_text,
        "duplicate_key_check": "exact_full_file",
        "scope": "Target and keys only; no cycle signatures or cross-resolution alignment verification.",
    }


def build_audit(config: ProjectConfig, data_dir: Path) -> dict:
    """Source inventory and the train-only candidate cohort (P0 contract).

    Annual counts describe the files only; candidate status uses train observations only.
    """
    paths = require_files(data_dir, config.files)
    columns = config.columns
    household_column = columns["household_id"]
    exclusions = config.raw["cohort"]["exclude_if_observed"]

    # 1. Read keys, the target and the exclusion channels of the 15-minute file.
    usecols = list(dict.fromkeys([household_column, columns["timestamp_15m"], columns["target"], *exclusions]))
    frame = pd.concat(iter_electric(paths["electric_15m"], usecols=usecols), ignore_index=True)
    frame["_ts"] = electric_timestamps(frame[columns["timestamp_15m"]])
    frame["_target"] = valid_target(frame[columns["target"]], config.target_dead_band)

    # 2. Row checks: whole-number household ids, duplicate keys, slots on the analysis grid.
    household_numeric = pd.to_numeric(frame[household_column], errors="coerce")
    valid_household = (household_numeric.notna() & np.isfinite(household_numeric)
                       & household_numeric.eq(household_numeric.round()))
    duplicate = frame.duplicated([household_column, "_ts"], keep=False) & frame["_ts"].notna()
    grid = slot_mask(frame["_ts"], config) & valid_household

    # 3. Denominators in elapsed 15-minute slots, so DST days count 92 or 100 slots.
    window_start = pd.Timestamp(config.raw["analysis_window_utc"]["start"])
    window_end = pd.Timestamp(config.raw["analysis_window_utc"]["end"])
    expected = int((window_end - window_start).total_seconds() / 900)
    train_bounds = config.raw["splits_local_date"]["train"]
    train_start = pd.Timestamp(train_bounds[0], tz=config.timezone)
    train_end = pd.Timestamp(train_bounds[1], tz=config.timezone)
    expected_train = int((train_end - train_start).total_seconds() / 900)
    minimum = config.raw["cohort"]["minimum_target_coverage"]

    # 4. Per household: annual inventory plus the train-only eligibility record.
    households = []
    candidates = []
    for household, group in frame.loc[valid_household].groupby(household_column):
        rows = group.index
        clean = group.loc[grid.loc[rows] & ~duplicate.loc[rows]]
        training = clean.loc[clean["_ts"].ge(train_start) & clean["_ts"].lt(train_end)]
        in_train = group["_ts"].ge(train_start) & group["_ts"].lt(train_end)
        train_duplicates = in_train & duplicate.loc[rows]
        valid_count = int(clean["_target"].notna().sum())
        eligibility = training_cohort_record(training, bool(train_duplicates.any()), config, expected_train)
        if eligibility["candidate"]:
            candidates.append(int(household))
        households.append({
            "household_id": int(household),
            "annual_unique_grid_slots": int(group.loc[grid.loc[rows], "_ts"].nunique()),
            "annual_valid_target_slots": valid_count,
            "annual_valid_target_coverage": valid_count / expected,
            "duplicate_rows": int(duplicate.loc[rows].sum()),
            **eligibility,
        })

    # 5. Weather and 1-minute inventories.
    weather_metadata, weather = weather_frame(paths["weather"], config)
    one_minute = _profile_one_minute(paths["electric_1m"], config)

    # 6. File-level counts of the 15-minute file.
    timestamps = frame["_ts"]
    has_timestamp = timestamps.notna()
    off_grid_rows = int((has_timestamp & timestamps.ne(timestamps.dt.floor("15min"))).sum())
    inside_window = timestamps.ge(window_start) & timestamps.lt(window_end)
    outside_window_rows = int((has_timestamp & ~inside_window).sum())
    keyed_rows = frame.loc[has_timestamp & valid_household]
    duplicate_keys = int(keyed_rows.duplicated([household_column, "_ts"]).sum())
    return {
        "schema_version": "1.1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_id": config.dataset_id,
        "source_unit_status": "unverified",
        "provenance": provenance(config, paths),
        "electric_15m": {
            "file": paths["electric_15m"].name,
            "rows": len(frame),
            "households": len(households),
            "observed_columns": pd.read_csv(paths["electric_15m"], nrows=0).columns.tolist(),
            "invalid_timestamp_rows": int(timestamps.isna().sum()),
            "invalid_household_rows": int((~valid_household).sum()),
            "off_grid_rows": off_grid_rows,
            "outside_window_rows": outside_window_rows,
            "duplicate_household_timestamp_keys": duplicate_keys,
            "invalid_or_missing_target_rows": int(frame["_target"].isna().sum()),
            "expected_slots_per_household": expected,
            "expected_training_slots_per_household": expected_train,
        },
        "electric_1m": one_minute,
        "weather": {
            "file": paths["weather"].name,
            "rows": len(weather),
            "metadata": weather_metadata,
            "first_timestamp_utc": weather["weather_ts_utc"].min().isoformat(),
            "last_timestamp_utc": weather["weather_ts_utc"].max().isoformat(),
            "missing_temperature_rows": int(weather["temperature_c"].isna().sum()),
        },
        "cohort_rule": {
            "selection_split": "train",
            "minimum_valid_target_coverage": minimum,
            "target_dead_band": config.target_dead_band,
            "exclude_if_observed": exclusions,
            "annual_inventory_is_descriptive_only": True,
        },
        "candidate_household_ids": candidates,
        "households": households,
        "limitations": [
            "Units, interval semantics and physical circuit mapping require provider confirmation.",
            "Candidate selection uses training observations only; annual inventory must not tune cohort rules.",
            "All duplicate-key rows are excluded from coverage; baseline rejects duplicate keys.",
            "Candidate status does not certify healthy equipment or operational readiness.",
            "Missing channels do not prove appliance absence; period-specific quality gates remain necessary.",
            "The 1-minute audit does not establish signature reliability or independent training samples.",
        ],
    }
