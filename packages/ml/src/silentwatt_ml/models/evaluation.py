"""Daily-qualified and supported-slot metrics; never conflate CQR bounds with quantiles."""
from __future__ import annotations

import numpy as np
import pandas as pd

from silentwatt_ml.models.baseline import pinball_loss


def metrics(frame: pd.DataFrame, mask: pd.Series) -> dict:
    scored = frame.loc[mask]
    result = {'expected_slots': len(frame), 'scored_slots': len(scored),
              'scored_fraction': len(scored) / len(frame) if len(frame) else None,
              'mae': None, 'mean_pinball': None, 'raw_coverage': None, 'raw_width': None,
              'calibrated_slots': 0, 'calibrated_coverage': None, 'calibrated_width': None}
    if scored.empty:
        result['status'] = 'no_eligible_slots'
        return result
    target = scored['target'].to_numpy()
    losses = [pinball_loss(target, scored[c].to_numpy(), q)
              for c, q in [('q05', .05), ('q50', .5), ('q95', .95)]]
    result.update(status='ok', mae=float(np.abs(target - scored['q50']).mean()),
                  mean_pinball=float(np.mean(losses)),
                  pinball_q05=losses[0], pinball_q50=losses[1], pinball_q95=losses[2],
                  raw_coverage=float(((target >= scored['q05']) & (target <= scored['q95'])).mean()),
                  raw_width=float((scored['q95'] - scored['q05']).mean()))
    calibrated = scored.dropna(subset=['lower', 'upper'])
    result['calibrated_slots'] = len(calibrated)
    if len(calibrated):
        result['calibrated_coverage'] = float(calibrated['target'].between(calibrated['lower'], calibrated['upper']).mean())
        result['calibrated_width'] = float((calibrated['upper'] - calibrated['lower']).mean())
    return result


def grouped_metrics(predictions: pd.DataFrame) -> list[dict]:
    records = []
    for (household, model, split), group in predictions.groupby(['household_id', 'model', 'split'], sort=True):
        for month, frame in [('all', group), *list(group.groupby('month', sort=True))]:
            for population, mask in [('daily_qualified', frame['eligible']),
                                     ('supported_slots_diagnostic', frame['slot_supported'])]:
                records.append({'household_id': int(household), 'model': model,
                                'split': split, 'month': month, 'population': population,
                                **metrics(frame, mask)})
    return records


def comparison_summary(predictions: pd.DataFrame, records: list[dict], candidate_ids: list[int]) -> dict:
    dev = predictions.loc[predictions['split'].eq('development')]
    summaries = {}
    for model, frame in dev.groupby('model', sort=True):
        houses = [r for r in records if r['model'] == model and r['split'] == 'development'
                  and r['month'] == 'all' and r['population'] == 'daily_qualified']
        scored = [r for r in houses if r['scored_slots']]
        summaries[model] = {'pooled': metrics(frame, frame['eligible']),
                            'households_with_scores': len(scored),
                            'households_fully_calibrated': sum(r['calibrated_slots'] == r['scored_slots']
                                                               and r['scored_slots'] > 0 for r in houses),
                            'macro_mean_pinball': float(np.mean([r['mean_pinball'] for r in scored])) if scored else None}
    paired = dev.pivot(index=['household_id', 'ts_utc'], columns='model', values='eligible')
    if set(paired.columns) != {'B0', 'B1'} or paired.isna().any().any() or not paired['B0'].equals(paired['B1']):
        raise ValueError('B0/B1 comparison populations must match exactly')
    b0, b1 = summaries['B0'], summaries['B1']
    full = all(s['households_fully_calibrated'] == len(candidate_ids) for s in (b0, b1))
    improvement = (b0['macro_mean_pinball'] is not None and b1['macro_mean_pinball'] is not None
                   and b1['macro_mean_pinball'] < b0['macro_mean_pinball'])
    calibrated = b1['pooled']
    coverage_ok = full and .87 <= calibrated['calibrated_coverage'] <= .93
    width_ok = full and calibrated['calibrated_width'] <= 1.10 * b0['pooled']['calibrated_width']
    return {'evaluation_split': 'development', 'test_accessed_for_selection': False,
            'models': summaries,
            'screening': {'all_households_calibrated': full, 'macro_pinball_improved': improvement,
                          'coverage_in_exploratory_band': coverage_ok, 'width_within_110pct_b0': width_ok},
            'recommendation': ('insufficient_evidence' if not full else
                               'B1' if improvement and coverage_ok and width_ok else 'retain_B0'),
            'recommendation_scope': 'development-only screening; not release approval or statistical significance',
            'comparison_status': 'complete' if full else 'incomplete_calibration_or_daily_support'}
