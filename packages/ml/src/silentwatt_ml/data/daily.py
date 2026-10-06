"""Past-only freeze suspicion and local-day research gates; no source correction."""
from __future__ import annotations

import numpy as np
import pandas as pd


def freeze_flags(frame: pd.DataFrame, minimum_slots: int) -> pd.Series:
    if type(minimum_slots) is not int or minimum_slots < 2:
        raise ValueError('Freeze run must contain at least two slots')
    values = frame['target']
    continues = (values.gt(0) & np.isfinite(values) & values.eq(values.shift())
                 & frame['ts_utc'].diff().eq(pd.Timedelta(minutes=15)))
    run = (~continues).cumsum()
    lengths = frame.groupby(run, sort=False).cumcount() + 1
    return values.gt(0) & np.isfinite(values) & lengths.ge(minimum_slots)


def daily_quality(frame: pd.DataFrame, timezone: str, settings: dict,
                  temperature_range: tuple[float, float] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Slot validity and the local-day research gate for one household.

    Frame must be a unique ordered UTC 15m grid, for one household only. A local day is
    eligible when enough of its slots are valid, no freeze run is suspected (while freeze
    blocking is on) and no slot lies outside the training temperature range.
    """
    frame = frame.copy()
    timestamps = frame['ts_utc']
    if timestamps.isna().any() or timestamps.duplicated().any() or not timestamps.is_monotonic_increasing:
        raise ValueError('Daily quality requires valid unique ordered timestamps')
    if timestamps.ne(timestamps.dt.floor('15min')).any():
        raise ValueError('Daily quality requires a 15-minute grid')

    # 1. Slot flags: freeze suspicion, temperature support, validity.
    frame['frozen_suspected'] = freeze_flags(frame, settings['frozen_run_slots'])
    weather_ok = np.isfinite(frame['temperature_c'])
    frame['out_of_support'] = False
    if temperature_range is not None:
        frame['out_of_support'] = weather_ok & ~frame['temperature_c'].between(*temperature_range)
    excluded_freeze = frame['frozen_suspected'] & settings['block_frozen_days']
    frame['slot_valid'] = (np.isfinite(frame['target']) & frame['target'].ge(0)
                           & weather_ok & ~excluded_freeze)
    frame['slot_supported'] = frame['slot_valid'] & ~frame['out_of_support']

    # 2. One summary row per local day.
    rows = []
    for day, group in frame.groupby('local_date', sort=True):
        # Elapsed slots of the local day: 92 or 100 on DST change days, 96 otherwise.
        day_start = pd.Timestamp(day, tz=timezone)
        next_day_start = pd.Timestamp((day_start.date() + pd.Timedelta(days=1)).isoformat(), tz=timezone)
        expected = int((next_day_start - day_start).total_seconds() / 900)
        missing_grid = expected - len(group)
        if missing_grid < 0:
            raise ValueError('Too many slots for local day')
        valid = int(group['slot_valid'].sum())
        frozen = int(group['frozen_suspected'].sum())
        unsupported = int(group['out_of_support'].sum())
        reasons = []
        if valid / expected < settings['minimum_coverage']:
            reasons.append('insufficient_daily_coverage')
        if frozen and settings['block_frozen_days']:
            reasons.append('frozen_suspected')
        if unsupported:
            reasons.append('temperature_out_of_support')
        labels = group['target_quality']
        rows.append({
            'local_date': day,
            'expected_slots': expected,
            'missing_row_slots': int(labels.eq('missing_row').sum()) + missing_grid,
            'null_target_slots': int(labels.eq('null_target').sum()),
            'negative_target_slots': int(labels.eq('negative_target').sum()),
            # Off-state readings the dead band set to 0; they stay valid (D-04).
            'dead_band_slots': int(labels.eq('dead_band').sum()),
            'invalid_target_slots': int(labels.eq('invalid_target').sum()),
            'missing_weather_slots': int((~np.isfinite(group['temperature_c'])).sum()),
            'frozen_suspected_slots': frozen,
            'out_of_support_slots': unsupported,
            'valid_joint_slots': valid,
            'supported_slots': int(group['slot_supported'].sum()),
            'valid_joint_coverage': valid / expected,
            'day_eligible': not reasons,
            'reasons': '|'.join(reasons) if reasons else 'ok',
        })
    days = pd.DataFrame(rows)
    if days.empty:
        raise ValueError('Daily quality needs at least one local day')

    # 3. A slot is eligible only on an eligible day and inside temperature support.
    frame = frame.merge(days[['local_date', 'day_eligible']], on='local_date', validate='many_to_one')
    frame['eligible'] = frame['day_eligible'] & frame['slot_supported']
    return frame, days
