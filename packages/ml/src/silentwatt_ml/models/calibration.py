"""Split CQR with an explicit pending state, no interpolation or band shrinkage.

Two calibration methods (config `p1.calibration.method`):

- symmetric (P1 protocols p1-v1 and p1-v2): one conformity score per slot covers both
  sides of the band, so a single correction qhat widens both sides.
- asymmetric (p1-v3, decision Q-03 of 2026-10-06; Romano, Patterson and Candès 2019): the
  lower and the upper side are calibrated separately, each at level 1 - alpha / 2. Many
  June readings are 0 and sit on a lower bound of 0, so the symmetric score spends almost
  the whole miss budget on the upper side, the side a detector reads.
"""
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
    Every correction is the rank-th smallest conformity score, floored at 0 so the band
    never shrinks:

    - symmetric: score max(q05 - y, y - q95) with rank = ceil((n + 1) * (1 - alpha));
      the one correction qhat is recorded for both sides.
    - asymmetric: scores q05 - y (lower side) and y - q95 (upper side), each with
      rank = ceil((n + 1) * (1 - alpha / 2)); qhat stays None, no single correction exists.

    apply_calibration reads qhat_lower and qhat_upper under both methods.
    """
    method = settings['method']
    if method not in ('symmetric', 'asymmetric'):
        raise ValueError(f'Unknown calibration method: {method!r}')

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
    # The asymmetric sides split the miss budget alpha: each side may miss alpha / 2.
    if method == 'symmetric':
        coverage_level = 1 - settings['alpha']
    else:
        coverage_level = 1 - settings['alpha'] / 2
    # Finite-sample conformal rank: (n + 1) instead of n keeps the coverage level for a new slot.
    rank = math.ceil((slot_count + 1) * coverage_level)
    profile = {'status': 'calibration_pending', 'method': method, 'slots': slot_count, 'days': day_count,
               'alpha': settings['alpha'], 'rank': rank,
               'qhat': None, 'qhat_lower': None, 'qhat_upper': None}

    # Too little June support gives no band at all rather than an unreliable one.
    # rank > n means the conformal quantile does not exist for this many slots.
    too_few_slots = slot_count < settings['minimum_slots']
    too_few_days = day_count < settings['minimum_days']
    if too_few_slots or too_few_days or rank > slot_count:
        profile['reason'] = 'insufficient_calibration_support'
        return profile

    if method == 'symmetric':
        # One score covers both sides: how far the target falls outside the raw q05-q95
        # band (negative when inside).
        qhat = _conformal_qhat(np.maximum(q05 - target, target - q95), rank)
        profile['qhat'] = qhat
        profile['qhat_lower'] = qhat
        profile['qhat_upper'] = qhat
    else:
        # Each side on its own: how far the target falls below q05, and above q95.
        profile['qhat_lower'] = _conformal_qhat(q05 - target, rank)
        profile['qhat_upper'] = _conformal_qhat(target - q95, rank)
    profile['status'] = 'calibrated'
    profile['reason'] = 'ok'
    return profile


def _conformal_qhat(scores: np.ndarray, rank: int) -> float:
    """Band correction: the rank-th smallest conformity score, floored at 0.

    The floor keeps the calibrated band at least as wide as the raw quantile band.
    """
    rank_th_smallest_score = float(np.sort(scores)[rank - 1])
    return max(0.0, rank_th_smallest_score)


def apply_calibration(predictions: pd.DataFrame, profile: dict) -> pd.DataFrame:
    """Calibrated band of every slot: lower = max(0, q05 - qhat_lower), upper = q95 + qhat_upper.

    Under the symmetric method both corrections equal qhat. While the profile is pending
    the bounds stay empty (NaN); no band is invented.
    """
    calibrated = predictions.copy()
    calibrated['lower'] = np.nan
    calibrated['upper'] = np.nan
    calibrated['calibration_status'] = profile['status']
    if profile['status'] == 'calibrated':
        # The lower bound stops at 0: valid air1 targets are never negative (dead band rule).
        calibrated['lower'] = (calibrated['q05'] - profile['qhat_lower']).clip(lower=0)
        calibrated['upper'] = calibrated['q95'] + profile['qhat_upper']
    return calibrated
