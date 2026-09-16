"""Shared quality rules. Invalid measurements are never replaced by zero."""
from __future__ import annotations

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.data.readers import read_weather


def electric_timestamps(values: pd.Series) -> pd.Series:
    # Electricity timestamps must carry their own UTC offset, including DST.
    explicit = values.astype("string").str.contains(
        r"[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$", na=False)
    return pd.to_datetime(values.where(explicit), utc=True, errors="coerce", format="mixed")


def valid_target(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    return numeric.where(np.isfinite(numeric) & (numeric >= 0))


def slot_mask(timestamps: pd.Series, config: ProjectConfig, frequency: str = "15min") -> pd.Series:
    start, end = (pd.Timestamp(config.raw["analysis_window_utc"][key]) for key in ("start", "end"))
    return timestamps.notna() & timestamps.eq(timestamps.dt.floor(frequency)) & timestamps.ge(start) & timestamps.lt(end)


def weather_frame(path, config: ProjectConfig) -> tuple[dict, pd.DataFrame]:
    metadata, frame = read_weather(path)
    if metadata.get("timezone") not in {"GMT", "UTC"} or float(metadata.get("utc_offset_seconds", "0")) != 0:
        raise ValueError("Weather timestamps require verified UTC/GMT metadata")
    result = pd.DataFrame({
        "weather_ts_utc": pd.to_datetime(frame[config.columns["weather_timestamp"]], utc=True, errors="coerce", format="mixed"),
        "temperature_c": pd.to_numeric(frame[config.columns["temperature"]], errors="coerce"),
    })
    ts = result["weather_ts_utc"]
    if ts.isna().any() or ts.duplicated().any() or ts.ne(ts.dt.floor("h")).any():
        raise ValueError("Weather timestamps must be valid, unique and on the hourly grid")
    result["temperature_c"] = result["temperature_c"].where(np.isfinite(result["temperature_c"]))
    return metadata, result
