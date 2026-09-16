from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.contracts import BaselineMetrics
from silentwatt_ml.data.quality import electric_timestamps, slot_mask, valid_target, weather_frame
from silentwatt_ml.data.readers import read_household_electric, require_files
from silentwatt_ml.provenance import provenance


@dataclass(frozen=True)
class BaselineResult:
    metrics: BaselineMetrics
    predictions: pd.DataFrame
    metadata: dict[str, Any]


def pinball_loss(actual: np.ndarray, predicted: np.ndarray, quantile: float) -> float:
    if not 0 < quantile < 1 or actual.shape != predicted.shape or actual.size == 0:
        raise ValueError("Pinball requires matching, nonempty arrays and quantile in (0, 1)")
    if not np.isfinite(actual).all() or not np.isfinite(predicted).all():
        raise ValueError("Pinball inputs must be finite")
    error = actual - predicted
    return float(np.mean(np.maximum(quantile * error, (quantile - 1.0) * error)))


def _prepare_frame(config: ProjectConfig, paths: dict[str, Path], household_id: int) -> tuple[pd.DataFrame, dict]:
    columns = config.columns
    raw = read_household_electric(
        paths["electric_15m"], household_column=columns["household_id"],
        household_id=household_id,
        usecols=[columns["household_id"], columns["timestamp_15m"], columns["target"]],
    )
    ts = electric_timestamps(raw[columns["timestamp_15m"]])
    target = valid_target(raw[columns["target"]])
    valid_slot = slot_mask(ts, config)
    selected = pd.DataFrame({"ts_utc": ts[valid_slot], "target": target[valid_slot]})
    if selected["ts_utc"].duplicated().any():
        raise ValueError("Duplicate electricity timestamps: resolve source keys before modeling")
    start, end = (pd.Timestamp(config.raw["analysis_window_utc"][key]) for key in ("start", "end"))
    grid = pd.DataFrame({"ts_utc": pd.date_range(start, end, freq="15min", inclusive="left")})
    frame = grid.merge(selected, how="left", on="ts_utc", validate="one_to_one")
    _, weather = weather_frame(paths["weather"], config)
    frame["weather_ts_utc"] = frame["ts_utc"].dt.floor("h")
    frame = frame.merge(weather, on="weather_ts_utc", how="left", validate="many_to_one")
    local = frame["ts_utc"].dt.tz_convert(config.timezone)
    frame["local_date"] = local.dt.date.astype(str)
    frame["local_hour"] = local.dt.hour
    width = float(config.raw["baseline"]["temperature_bin_c"])
    frame["temperature_bin_c"] = np.floor(frame["temperature_c"] / width) * width
    quality = {
        "source_rows": len(raw),
        "invalid_timestamp_rows": int(ts.isna().sum()),
        "excluded_timestamp_rows": int((~valid_slot).sum()),
        "invalid_or_missing_target_rows": int(target.isna().sum()),
    }
    return frame, quality


def _quantile_table(frame: pd.DataFrame, keys: list[str], minimum_samples: int) -> pd.DataFrame:
    grouped = frame.groupby(keys, observed=True)["target"]
    table = grouped.quantile([0.05, 0.5, 0.95]).unstack().reset_index()
    table.columns = [*keys, "q05", "q50", "q95"]
    counts = grouped.size().rename("sample_count").reset_index()
    return table.merge(counts, on=keys).query("sample_count >= @minimum_samples")


def run_baseline(
    config: ProjectConfig, data_dir: Path, household_id: int,
    *, evaluation_split: str = "development", allow_test: bool = False,
) -> BaselineResult:
    if evaluation_split not in {"development", "test"}:
        raise ValueError("Evaluation must use development or explicitly unlocked test")
    if evaluation_split == "test" and not allow_test:
        raise ValueError("Locked test requires allow_test=True after experiment freeze")
    paths = require_files(data_dir, {key: config.files[key] for key in ("electric_15m", "weather")})
    frame, quality = _prepare_frame(config, paths, household_id)
    splits = config.raw["splits_local_date"]
    def split(name):
        lo, hi = splits[name]
        return frame.loc[frame["local_date"].ge(lo) & frame["local_date"].lt(hi)].copy()
    train = split("train").dropna(subset=["target", "temperature_c"])
    evaluation = split(evaluation_split)
    if train.empty or evaluation.empty:
        raise ValueError("Train or evaluation split has no usable rows")
    settings = config.raw["baseline"]
    detailed = _quantile_table(train, ["local_hour", "temperature_bin_c"], settings["minimum_hour_temperature_samples"])
    temperature = _quantile_table(train, ["temperature_bin_c"], settings["minimum_temperature_samples"])
    quantiles = train["target"].quantile(settings["quantiles"])
    predicted = evaluation.merge(detailed, on=["local_hour", "temperature_bin_c"], how="left", validate="many_to_one")
    fallback = predicted[["temperature_bin_c"]].merge(temperature, on="temperature_bin_c", how="left", validate="many_to_one")
    source = np.full(len(predicted), "hour_temperature", dtype=object)
    for quantile, column in [(0.05, "q05"), (0.5, "q50"), (0.95, "q95")]:
        missing = predicted[column].isna()
        predicted.loc[missing, column] = fallback.loc[missing, column]
        source[missing.to_numpy()] = "temperature"
        missing = predicted[column].isna()
        predicted.loc[missing, column] = float(quantiles.loc[quantile])
        source[missing.to_numpy()] = "global"
    predicted["prediction_source"] = source
    low, high = float(train["temperature_c"].min()), float(train["temperature_c"].max())
    predicted["prediction_status"] = "ok"
    unsupported = predicted["temperature_c"].notna() & ~predicted["temperature_c"].between(low, high)
    predicted.loc[unsupported, "prediction_status"] = "temperature_out_of_support"
    predicted.loc[predicted["temperature_c"].isna(), "prediction_status"] = "missing_weather"
    # An unsupported fallback must not silently become evidence for a maintenance case.
    invalid_prediction = predicted["prediction_status"].ne("ok")
    predicted.loc[invalid_prediction, ["q05", "q50", "q95"]] = np.nan
    predicted.loc[invalid_prediction, "prediction_source"] = "none"
    predicted["measurement_status"] = np.where(predicted["target"].notna(), "ok", "missing_or_invalid_target")
    predicted["scored"] = predicted["prediction_status"].eq("ok") & predicted["target"].notna()
    scored = predicted.loc[predicted["scored"]]
    if scored.empty:
        raise ValueError("No supported evaluation rows with valid targets; metrics are undefined")
    actual, q05, q50, q95 = (scored[column].to_numpy() for column in ("target", "q05", "q50", "q95"))
    metrics = BaselineMetrics(
        household_id=household_id, target=config.columns["target"],
        train_rows=len(train), evaluation_split=evaluation_split,
        evaluation_slots=len(predicted), scored_rows=len(scored),
        missing_target_slots=int(predicted["target"].isna().sum()),
        missing_weather_slots=int(predicted["temperature_c"].isna().sum()),
        out_of_support_rows=int(unsupported.sum()),
        mae_median=float(np.mean(np.abs(actual - q50))),
        pinball_q05=pinball_loss(actual, q05, 0.05),
        pinball_q50=pinball_loss(actual, q50, 0.5),
        pinball_q95=pinball_loss(actual, q95, 0.95),
        interval_coverage=float(np.mean((actual >= q05) & (actual <= q95))),
        mean_interval_width=float(np.mean(q95 - q05)),
    )
    metadata = {
        "schema_version": "1.1", "model": "temperature_hour_empirical_quantile_baseline",
        "model_version": "0.2.0", "dataset_id": config.dataset_id,
        "evaluation_split": evaluation_split, "test_access_explicit": allow_test,
        "quality": quality, "provenance": provenance(config, paths),
        "model_parameters": {
            "hour_temperature_table": detailed.to_dict(orient="records"),
            "temperature_table": temperature.to_dict(orient="records"),
            "global_quantiles": {str(key): float(value) for key, value in quantiles.items()},
            "training_temperature_range_c": [low, high],
        },
        "source_unit": "source_unit_unverified",
        "limitations": [
            "Uncalibrated empirical intervals; no nominal coverage guarantee.",
            "Historical observed weather: retrospective expected-consumption estimation, not an advance weather forecast.",
            "Metrics cover supported, valid slots only; excluded counts must accompany them.",
            "No cohort readiness gate or daily detector is implemented by this exploratory command.",
            "Thermostat, occupancy, indoor temperature and verified fault labels are unavailable.",
            "Forecast error and interval coverage do not establish field fault-detection performance.",
        ],
    }
    output_columns = ["ts_utc", "local_date", "local_hour", "temperature_c", "target", "q05", "q50", "q95",
                      "prediction_source", "prediction_status", "measurement_status", "scored"]
    return BaselineResult(metrics, predicted[output_columns].sort_values("ts_utc"), metadata)
