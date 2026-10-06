"""Split CQR with an explicit pending state, no interpolation or band shrinkage."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

QUANTILES = ['q05', 'q50', 'q95']


def ordered_quantiles(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or values.shape[1] != 3 or not np.isfinite(values).all():
        raise ValueError('Quantile predictions must be a finite n-by-3 matrix')
    return np.sort(np.maximum(values, 0), axis=1)


def calibrate(predictions: pd.DataFrame, settings: dict) -> dict:
    """Split CQR profile of one household and model, fitted on the calibration split (June).

    The input must be the calibration split; only daily-qualified ('eligible') slots fit.
    The band correction qhat is the rank-th smallest conformity score with
    rank = ceil((n + 1) * (1 - alpha)), floored at 0 so the band never shrinks.
    """
    calibration_slots = predictions.loc[predictions['eligible']]
    target = calibration_slots['target'].to_numpy(dtype=float)
    q05 = calibration_slots['q05'].to_numpy(dtype=float)
    q50 = calibration_slots['q50'].to_numpy(dtype=float)
    q95 = calibration_slots['q95'].to_numpy(dtype=float)

    every_value = np.concatenate([target, q05, q50, q95])
    if not np.isfinite(every_value).all() or (every_value < 0).any():
        raise ValueError('Calibration rows must be finite and nonnegative')
    if ((q05 > q50) | (q50 > q95)).any():
        raise ValueError('Calibration quantiles must be ordered')

    slot_count = len(calibration_slots)
    day_count = int(calibration_slots['local_date'].nunique())
    # Finite-sample conformal rank: (n + 1) instead of n keeps the coverage level for a new slot.
    rank = math.ceil((slot_count + 1) * (1 - settings['alpha']))
    profile = {'status': 'calibration_pending', 'slots': slot_count, 'days': day_count,
               'alpha': settings['alpha'], 'rank': rank, 'qhat': None}

    # Too little June support gives no band at all rather than an unreliable one.
    # rank > n means the conformal quantile does not exist for this many slots.
    too_few_slots = slot_count < settings['minimum_slots']
    too_few_days = day_count < settings['minimum_days']
    if too_few_slots or too_few_days or rank > slot_count:
        profile['reason'] = 'insufficient_calibration_support'
        return profile

    # Conformity score: how far the target falls outside the raw q05-q95 band
    # (negative when inside). One score covers both sides of the band.
    scores = np.maximum(q05 - target, target - q95)
    rank_th_smallest_score = float(np.sort(scores)[rank - 1])
    profile['status'] = 'calibrated'
    profile['qhat'] = max(0.0, rank_th_smallest_score)
    profile['reason'] = 'ok'
    return profile


def apply_calibration(predictions: pd.DataFrame, profile: dict) -> pd.DataFrame:
    """Calibrated band of every slot: lower = max(0, q05 - qhat), upper = q95 + qhat.

    While the profile is pending the bounds stay empty (NaN); no band is invented.
    """
    calibrated = predictions.copy()
    calibrated['lower'] = np.nan
    calibrated['upper'] = np.nan
    calibrated['calibration_status'] = profile['status']
    if profile['status'] == 'calibrated':
        qhat = profile['qhat']
        # The lower bound stops at 0: valid air1 targets are never negative (dead band rule).
        calibrated['lower'] = (calibrated['q05'] - qhat).clip(lower=0)
        calibrated['upper'] = calibrated['q95'] + qhat
    return calibrated
