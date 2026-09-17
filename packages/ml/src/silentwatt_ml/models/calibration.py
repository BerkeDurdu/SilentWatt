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
    """Input is explicitly the calibration split. Only daily-qualified slots fit."""
    selected = predictions.loc[predictions['eligible']]
    values = selected[['target', *QUANTILES]].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError('Calibration rows must be finite and nonnegative')
    if len(values) and ((values[:, 1] > values[:, 2]) | (values[:, 2] > values[:, 3])).any():
        raise ValueError('Calibration quantiles must be ordered')
    n, days = len(selected), int(selected['local_date'].nunique())
    rank = math.ceil((n + 1) * (1 - settings['alpha']))
    result = {'status': 'calibration_pending', 'slots': n, 'days': days,
              'alpha': settings['alpha'], 'rank': rank, 'qhat': None}
    if n < settings['minimum_slots'] or days < settings['minimum_days'] or rank > n:
        result['reason'] = 'insufficient_calibration_support'
        return result
    scores = np.maximum(values[:, 1] - values[:, 0], values[:, 0] - values[:, 3])
    result.update(status='calibrated', reason='ok',
                  qhat=max(0.0, float(np.partition(scores, rank - 1)[rank - 1])))
    return result


def apply_calibration(predictions: pd.DataFrame, profile: dict) -> pd.DataFrame:
    result = predictions.copy()
    result['lower'] = np.nan
    result['upper'] = np.nan
    result['calibration_status'] = profile['status']
    if profile['status'] == 'calibrated':
        result['lower'] = (result['q05'] - profile['qhat']).clip(lower=0)
        result['upper'] = result['q95'] + profile['qhat']
    return result
