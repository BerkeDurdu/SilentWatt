from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class BaselineMetrics:
    household_id: int
    target: str
    train_rows: int
    evaluation_split: str
    evaluation_slots: int
    scored_rows: int
    missing_target_slots: int
    missing_weather_slots: int
    out_of_support_rows: int
    mae_median: float
    pinball_q05: float
    pinball_q50: float
    pinball_q95: float
    interval_coverage: float
    mean_interval_width: float
    source_unit: str = "source_unit_unverified"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
