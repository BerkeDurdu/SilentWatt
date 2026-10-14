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


def calibrate_asymmetric(predictions: pd.DataFrame, settings: dict) -> dict:
    """p1-v3: the lower and the upper bound are calibrated apart, each at alpha / 2.

    Symmetric CQR takes one margin for both sides, so misses pile up above the band when the
    model errs upward (Q-03). Here each side gets its own conformal margin (Romano et al. 2019,
    asymmetric variant). A margin is never negative: the band does not shrink.
    """
    selected = predictions.loc[predictions['eligible']]
    values = selected[['target', *QUANTILES]].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError('Calibration rows must be finite and nonnegative')
    n, days = len(selected), int(selected['local_date'].nunique())
    alpha = settings['alpha']
    rank = math.ceil((n + 1) * (1 - alpha / 2))
    result = {'status': 'calibration_pending', 'method': 'asymmetric', 'slots': n, 'days': days,
              'alpha': alpha, 'rank': rank, 'qhat_lower': None, 'qhat_upper': None}
    if n < settings['minimum_slots'] or days < settings['minimum_days'] or rank > n:
        result['reason'] = 'insufficient_calibration_support'
        return result
    below = values[:, 1] - values[:, 0]   # how far the reading lies under q05
    above = values[:, 0] - values[:, 3]   # how far it lies over q95
    result.update(status='calibrated', reason='ok',
                  qhat_lower=max(0.0, float(np.partition(below, rank - 1)[rank - 1])),
                  qhat_upper=max(0.0, float(np.partition(above, rank - 1)[rank - 1])))
    return result


def apply_calibration(predictions: pd.DataFrame, profile: dict) -> pd.DataFrame:
    result = predictions.copy()
    result['lower'] = np.nan
    result['upper'] = np.nan
    result['calibration_status'] = profile['status']
    if profile['status'] == 'calibrated':
        lower_margin = profile.get('qhat_lower', profile.get('qhat'))
        upper_margin = profile.get('qhat_upper', profile.get('qhat'))
        result['lower'] = (result['q05'] - lower_margin).clip(lower=0)
        result['upper'] = result['q95'] + upper_margin
    return result
