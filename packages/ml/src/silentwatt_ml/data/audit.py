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
    columns = config.columns
    rows = invalid = invalid_target = off_grid = missing_household = 0
    keys = defaultdict(list)
    for chunk in iter_electric(path, usecols=[columns["household_id"], columns["timestamp_1m"], columns["target"]]):
        ts = electric_timestamps(chunk[columns["timestamp_1m"]])
        rows += len(chunk)
        missing_household += int(chunk[columns["household_id"]].isna().sum())
        invalid += int(ts.isna().sum())
        invalid_target += int(valid_target(chunk[columns["target"]]).isna().sum())
        off_grid += int((ts.notna() & ts.ne(ts.dt.floor("min"))).sum())
        for household, group in chunk.assign(_ts=ts).groupby(columns["household_id"]):
            keys[str(household)].append(group["_ts"].dropna().astype("int64").to_numpy())
    duplicate = 0
    first = last = None
    for arrays in keys.values():
        values = np.concatenate(arrays)
        if not len(values):
            continue
        unique = np.unique(values)
        duplicate += len(values) - len(unique)
        first = int(unique[0]) if first is None else min(first, int(unique[0]))
        last = int(unique[-1]) if last is None else max(last, int(unique[-1]))
    return {
        "file": path.name, "bytes": path.stat().st_size, "rows": rows,
        "households": len(keys), "invalid_timestamp_rows": invalid,
        "missing_household_rows": missing_household,
        "invalid_or_missing_target_rows": invalid_target, "off_grid_rows": off_grid,
        "duplicate_household_timestamp_keys": int(duplicate),
        "first_timestamp_utc": pd.Timestamp(first, tz="UTC").isoformat() if first is not None else None,
        "last_timestamp_utc": pd.Timestamp(last, tz="UTC").isoformat() if last is not None else None,
        "duplicate_key_check": "exact_full_file",
        "scope": "Target and keys only; no cycle signatures or cross-resolution alignment verification.",
    }


def build_audit(config: ProjectConfig, data_dir: Path) -> dict:
    paths = require_files(data_dir, config.files)
    columns = config.columns
    exclusions = config.raw["cohort"]["exclude_if_observed"]
    usecols = list(dict.fromkeys([columns["household_id"], columns["timestamp_15m"], columns["target"], *exclusions]))
    frame = pd.concat(iter_electric(paths["electric_15m"], usecols=usecols), ignore_index=True)
    frame["_ts"] = electric_timestamps(frame[columns["timestamp_15m"]])
    frame["_target"] = valid_target(frame[columns["target"]])
    household_numeric = pd.to_numeric(frame[columns["household_id"]], errors="coerce")
    valid_household = household_numeric.notna() & np.isfinite(household_numeric) & household_numeric.eq(household_numeric.round())
    duplicate = frame.duplicated([columns["household_id"], "_ts"], keep=False) & frame["_ts"].notna()
    grid = slot_mask(frame["_ts"], config) & valid_household
    start, end = (pd.Timestamp(config.raw["analysis_window_utc"][key]) for key in ("start", "end"))
    expected = int((end - start).total_seconds() / 900)
    train_start, train_end = (pd.Timestamp(value, tz=config.timezone) for value in config.raw["splits_local_date"]["train"])
    expected_train = int((train_end - train_start).total_seconds() / 900)
    minimum = config.raw["cohort"]["minimum_target_coverage"]
    households, candidates = [], []
    for household, group in frame.loc[valid_household].groupby(columns["household_id"]):
        idx = group.index
        clean = group.loc[grid.loc[idx] & ~duplicate.loc[idx]]
        training = clean.loc[clean["_ts"].ge(train_start) & clean["_ts"].lt(train_end)]
        train_duplicates = group["_ts"].ge(train_start) & group["_ts"].lt(train_end) & duplicate.loc[idx]
        valid_count = int(clean["_target"].notna().sum())
        eligibility = training_cohort_record(training, bool(train_duplicates.any()), config, expected_train)
        if eligibility["candidate"]:
            candidates.append(int(household))
        households.append({
            "household_id": int(household),
            "annual_unique_grid_slots": int(group.loc[grid.loc[idx], "_ts"].nunique()),
            "annual_valid_target_slots": valid_count,
            "annual_valid_target_coverage": valid_count / expected,
            "duplicate_rows": int(duplicate.loc[idx].sum()),
            **eligibility,
        })
    weather_metadata, weather = weather_frame(paths["weather"], config)
    one_minute = _profile_one_minute(paths["electric_1m"], config)
    return {
        "schema_version": "1.1", "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_id": config.dataset_id, "source_unit_status": "unverified",
        "provenance": provenance(config, paths),
        "electric_15m": {
            "file": paths["electric_15m"].name, "rows": len(frame), "households": len(households),
            "observed_columns": pd.read_csv(paths["electric_15m"], nrows=0).columns.tolist(),
            "invalid_timestamp_rows": int(frame["_ts"].isna().sum()),
            "invalid_household_rows": int((~valid_household).sum()),
            "off_grid_rows": int((frame["_ts"].notna() & frame["_ts"].ne(frame["_ts"].dt.floor("15min"))).sum()),
            "outside_window_rows": int((frame["_ts"].notna() & ~(frame["_ts"].ge(start) & frame["_ts"].lt(end))).sum()),
            "duplicate_household_timestamp_keys": int(frame.loc[frame["_ts"].notna() & valid_household].duplicated([columns["household_id"], "_ts"]).sum()),
            "invalid_or_missing_target_rows": int(frame["_target"].isna().sum()),
            "expected_slots_per_household": expected, "expected_training_slots_per_household": expected_train,
        },
        "electric_1m": one_minute,
        "weather": {
            "file": paths["weather"].name, "rows": len(weather), "metadata": weather_metadata,
            "first_timestamp_utc": weather["weather_ts_utc"].min().isoformat(),
            "last_timestamp_utc": weather["weather_ts_utc"].max().isoformat(),
            "missing_temperature_rows": int(weather["temperature_c"].isna().sum()),
        },
        "cohort_rule": {
            "selection_split": "train", "minimum_valid_target_coverage": minimum,
            "exclude_if_observed": exclusions, "annual_inventory_is_descriptive_only": True,
        },
        "candidate_household_ids": candidates, "households": households,
        "limitations": [
            "Units, interval semantics and physical circuit mapping require provider confirmation.",
            "Candidate selection uses training observations only; annual inventory must not tune cohort rules.",
            "All duplicate-key rows are excluded from coverage; baseline rejects duplicate keys.",
            "Candidate status does not certify healthy equipment or operational readiness.",
            "Missing channels do not prove appliance absence; period-specific quality gates remain necessary.",
            "The 1-minute audit does not establish signature reliability or independent training samples.",
        ],
    }
