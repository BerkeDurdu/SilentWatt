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

    @property
    def target_dead_band(self) -> float:
        return float(self.raw["target_dead_band"])


def load_config(path: str | Path) -> ProjectConfig:
    """Read the project config and reject values the pipeline cannot use safely."""
    source = Path(path).expanduser().resolve()
    with source.open(encoding="utf-8") as handle:
        raw = json.load(handle)

    required = {
        "dataset_id",
        "display_timezone",
        "files",
        "columns",
        "target_dead_band",
        "analysis_window_utc",
        "splits_local_date",
        "cohort",
        "baseline",
    }
    missing = sorted(required - raw.keys())
    if missing:
        raise ValueError(f"Config is missing required keys: {', '.join(missing)}")

    # A missing or wrongly typed nested value becomes one readable ValueError.
    try:
        ZoneInfo(raw["display_timezone"])
        _check_files(raw["files"])
        _check_columns(raw["columns"])
        _check_target_dead_band(raw["target_dead_band"])
        window_start, window_end = _check_analysis_window(raw["analysis_window_utc"])
        _check_splits(raw["splits_local_date"], raw["display_timezone"], window_start, window_end)
        _check_baseline(raw["baseline"])
        _check_cohort(raw["cohort"])
        if "p1" in raw:
            _check_p1(raw["p1"])
    except (KeyError, TypeError, OverflowError) as exc:
        raise ValueError(f"Invalid nested config: {exc}") from exc
    return ProjectConfig(raw=raw, source=source)


def _check_files(files: dict) -> None:
    """Dataset filenames stay relative to the data directory."""
    for name in ("electric_1m", "electric_15m", "weather"):
        filename = files[name]
        is_text = isinstance(filename, str) and bool(filename)
        if not is_text or Path(filename).is_absolute() or ".." in Path(filename).parts:
            raise ValueError("Dataset filenames must be relative paths within data-dir")


def _check_columns(columns: dict) -> None:
    """Every column the pipeline reads has a name."""
    for name in ("household_id", "timestamp_1m", "timestamp_15m", "target", "weather_timestamp", "temperature"):
        column = columns[name]
        if not isinstance(column, str) or not column:
            raise ValueError(f"Invalid column: {name}")


def _check_target_dead_band(dead_band: object) -> None:
    """Target readings within +-dead band of zero are the off state (D-04, decided 2026-10-06)."""
    is_number = isinstance(dead_band, (int, float)) and not isinstance(dead_band, bool)
    if not is_number or not math.isfinite(dead_band) or dead_band < 0:
        raise ValueError("target_dead_band must be a finite number >= 0")


def _check_analysis_window(window: dict) -> tuple[pd.Timestamp, pd.Timestamp]:
    """The analysis window is timezone-aware, ordered and on the 15-minute grid."""
    start = pd.Timestamp(window["start"])
    end = pd.Timestamp(window["end"])
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise ValueError("Analysis window must be ordered and timezone-aware")
    if start != start.floor("15min") or end != end.floor("15min"):
        raise ValueError("Analysis window must align to 15-minute slots")
    return start, end


def _check_splits(splits: dict, timezone: str, window_start: pd.Timestamp, window_end: pd.Timestamp) -> None:
    """Splits are local-date ranges in time order, without overlap, inside the analysis window."""
    previous_end = None
    for name in ("train", "calibration", "development", "test"):
        bounds = splits[name]
        if len(bounds) != 2:
            raise ValueError(f"Invalid split: {name}")
        split_start = pd.Timestamp(date.fromisoformat(bounds[0]), tz=timezone)
        split_end = pd.Timestamp(date.fromisoformat(bounds[1]), tz=timezone)
        overlaps_previous = previous_end is not None and split_start < previous_end
        outside_window = split_start < window_start or split_end > window_end
        if split_start >= split_end or overlaps_previous or outside_window:
            raise ValueError("Splits must be chronological, non-overlapping and inside analysis window")
        previous_end = split_end


def _check_baseline(settings: dict) -> None:
    """Empirical baseline: positive bin width, positive sample minimums, fixed quantiles."""
    width = float(settings["temperature_bin_c"])
    if not math.isfinite(width) or width <= 0:
        raise ValueError("temperature_bin_c must be finite and positive")
    for key in ("minimum_hour_temperature_samples", "minimum_temperature_samples"):
        if type(settings[key]) is not int or settings[key] < 1:
            raise ValueError(f"{key} must be a positive integer")
    if settings["quantiles"] != [0.05, 0.5, 0.95]:
        raise ValueError("This baseline contract supports quantiles [0.05, 0.5, 0.95] only")


def _check_cohort(cohort: dict) -> None:
    """Cohort rule: a coverage share in (0, 1] and a list of exclusion channel names."""
    if not 0 < float(cohort["minimum_target_coverage"]) <= 1:
        raise ValueError("minimum_target_coverage must be in (0, 1]")
    exclusions = cohort["exclude_if_observed"]
    if not isinstance(exclusions, list):
        raise ValueError("exclude_if_observed must be a list of column names")
    for channel in exclusions:
        if not isinstance(channel, str) or not channel:
            raise ValueError("exclude_if_observed must be a list of column names")


def _check_p1(p1: dict) -> None:
    """P1 protocol: version, daily quality gates, calibration and quantile model settings."""
    # p1-v2 adds the target dead band; p1-v1 results stay reproducible from their own commit.
    if p1["protocol_version"] != "p1-v2":
        raise ValueError("Unsupported P1 protocol_version")
    quality = p1["daily_quality"]
    calibration = p1["calibration"]
    model = p1["quantile_model"]
    if not 0 < quality["minimum_coverage"] <= 1:
        raise ValueError("Daily minimum_coverage must be in (0, 1]")
    if type(quality["block_frozen_days"]) is not bool:
        raise ValueError("block_frozen_days must be boolean")
    # Each count must be an integer at or above its smallest meaningful value.
    counts_and_minimums = [
        (quality["frozen_run_slots"], 2),
        (calibration["minimum_days"], 1),
        (calibration["minimum_slots"], 1),
        (model["max_iter"], 1),
        (model["max_leaf_nodes"], 2),
        (model["min_samples_leaf"], 1),
    ]
    for value, minimum in counts_and_minimums:
        if type(value) is not int or value < minimum:
            raise ValueError("P1 counts must be valid positive integers")
    if calibration["alpha"] != 0.1:
        raise ValueError("P1 q05/q95 contract requires alpha=0.1")
    if not math.isfinite(model["learning_rate"]) or model["learning_rate"] <= 0:
        raise ValueError("learning_rate must be finite and positive")
    if type(model["random_state"]) is not int or not 0 <= model["random_state"] < 2**32:
        raise ValueError("random_state must be an unsigned 32-bit integer")
    # Report metric: coverage while the unit runs counts slots whose target is above this value.
    running_threshold = p1["evaluation"]["running_threshold"]
    is_number = isinstance(running_threshold, (int, float)) and not isinstance(running_threshold, bool)
    if not is_number or not math.isfinite(running_threshold) or running_threshold <= 0:
        raise ValueError("running_threshold must be a finite positive number")
