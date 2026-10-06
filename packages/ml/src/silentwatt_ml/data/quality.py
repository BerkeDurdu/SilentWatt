"""Shared quality rules. Invalid measurements are never replaced by zero; only off-state
readings inside the target dead band read as 0."""
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


def valid_target(values: pd.Series, dead_band: float) -> pd.Series:
    """Target values the quality rules accept; NaN marks an invalid or missing reading.

    Sensors rest at slightly different levels around zero while the circuit is off
    (-0.001 in one household, +0.004 in another). Readings within +-dead_band of zero
    are therefore the off state and read as 0 (D-04, decided 2026-10-06). Readings
    further below zero stay invalid. A dead band of 0 keeps the original rule, in which
    every negative reading is invalid.
    """
    numeric = pd.to_numeric(values, errors="coerce")
    finite = numeric.where(np.isfinite(numeric))
    accepted = finite.where(finite >= -dead_band)
    # NaN is never inside the band, so missing and invalid readings stay NaN.
    off_state = accepted.abs().le(dead_band)
    return accepted.mask(off_state, 0.0)


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
