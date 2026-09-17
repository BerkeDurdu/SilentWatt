from __future__ import annotations

import json
import math
from datetime import date
from zoneinfo import ZoneInfo
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class ProjectConfig:
    raw: dict[str, Any]
    source: Path

    @property
    def dataset_id(self) -> str:
        return str(self.raw["dataset_id"])

    @property
    def files(self) -> dict[str, str]:
        return dict(self.raw["files"])

    @property
    def columns(self) -> dict[str, str]:
        return dict(self.raw["columns"])

    @property
    def timezone(self) -> str:
        return str(self.raw["display_timezone"])


def load_config(path: str | Path) -> ProjectConfig:
    source = Path(path).expanduser().resolve()
    with source.open(encoding="utf-8") as handle:
        raw = json.load(handle)

    required = {
        "dataset_id",
        "display_timezone",
        "files",
        "columns",
        "analysis_window_utc",
        "splits_local_date",
        "cohort",
        "baseline",
    }
    missing = sorted(required - raw.keys())
    if missing:
        raise ValueError(f"Config is missing required keys: {', '.join(missing)}")
    try:
        ZoneInfo(raw["display_timezone"])
        for name in ("electric_1m", "electric_15m", "weather"):
            filename = raw["files"][name]
            if not isinstance(filename, str) or not filename or Path(filename).is_absolute() or ".." in Path(filename).parts:
                raise ValueError("Dataset filenames must be relative paths within data-dir")
        for name in ("household_id", "timestamp_1m", "timestamp_15m", "target", "weather_timestamp", "temperature"):
            if not isinstance(raw["columns"][name], str) or not raw["columns"][name]:
                raise ValueError(f"Invalid column: {name}")
        start, end = (pd.Timestamp(raw["analysis_window_utc"][key]) for key in ("start", "end"))
        if start.tzinfo is None or end.tzinfo is None or start >= end:
            raise ValueError("Analysis window must be ordered and timezone-aware")
        if start != start.floor("15min") or end != end.floor("15min"):
            raise ValueError("Analysis window must align to 15-minute slots")
        previous = None
        for name in ("train", "calibration", "development", "test"):
            bounds = raw["splits_local_date"][name]
            if len(bounds) != 2:
                raise ValueError(f"Invalid split: {name}")
            lo, hi = (pd.Timestamp(date.fromisoformat(value), tz=raw["display_timezone"]) for value in bounds)
            if lo >= hi or (previous is not None and lo < previous) or lo < start or hi > end:
                raise ValueError("Splits must be chronological, non-overlapping and inside analysis window")
            previous = hi
        settings = raw["baseline"]
        width = float(settings["temperature_bin_c"])
        if not math.isfinite(width) or width <= 0:
            raise ValueError("temperature_bin_c must be finite and positive")
        for key in ("minimum_hour_temperature_samples", "minimum_temperature_samples"):
            if type(settings[key]) is not int or settings[key] < 1:
                raise ValueError(f"{key} must be a positive integer")
        if settings["quantiles"] != [0.05, 0.5, 0.95]:
            raise ValueError("This baseline contract supports quantiles [0.05, 0.5, 0.95] only")
        if not 0 < float(raw["cohort"]["minimum_target_coverage"]) <= 1:
            raise ValueError("minimum_target_coverage must be in (0, 1]")
        exclusions = raw["cohort"]["exclude_if_observed"]
        if not isinstance(exclusions, list) or any(not isinstance(value, str) or not value for value in exclusions):
            raise ValueError("exclude_if_observed must be a list of column names")
        if "p1" in raw:
            p1 = raw["p1"]
            if p1["protocol_version"] != "p1-v1":
                raise ValueError("Unsupported P1 protocol_version")
            quality, calibration, model = (p1[k] for k in ("daily_quality", "calibration", "quantile_model"))
            if not 0 < quality["minimum_coverage"] <= 1:
                raise ValueError("Daily minimum_coverage must be in (0, 1]")
            if type(quality["block_frozen_days"]) is not bool:
                raise ValueError("block_frozen_days must be boolean")
            for value, minimum in ((quality["frozen_run_slots"], 2),
                                   (calibration["minimum_days"], 1), (calibration["minimum_slots"], 1),
                                   (model["max_iter"], 1), (model["max_leaf_nodes"], 2),
                                   (model["min_samples_leaf"], 1)):
                if type(value) is not int or value < minimum:
                    raise ValueError("P1 counts must be valid positive integers")
            if calibration["alpha"] != 0.1:
                raise ValueError("P1 q05/q95 contract requires alpha=0.1")
            if not math.isfinite(model["learning_rate"]) or model["learning_rate"] <= 0:
                raise ValueError("learning_rate must be finite and positive")
            if type(model["random_state"]) is not int or not 0 <= model["random_state"] < 2**32:
                raise ValueError("random_state must be an unsigned 32-bit integer")
    except (KeyError, TypeError, OverflowError) as exc:
        raise ValueError(f"Invalid nested config: {exc}") from exc
    return ProjectConfig(raw=raw, source=source)
