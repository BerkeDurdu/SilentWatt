"""Daily-qualified and supported-slot metrics; never conflate CQR bounds with quantiles."""
from __future__ import annotations

import numpy as np
import pandas as pd

from silentwatt_ml.models.baseline import pinball_loss


def metrics(frame: pd.DataFrame, mask: pd.Series, running_threshold: float) -> dict:
    """Point and interval metrics on the masked slots; raw quantiles and CQR bounds stay apart.

    running_threshold: slots whose target is above it count as "unit running" for the
    coverage-while-running metric.
    """
    scored = frame.loc[mask]
    result = {
        'expected_slots': len(frame),
        'scored_slots': len(scored),
        'scored_fraction': len(scored) / len(frame) if len(frame) else None,
        'mae': None,
        'mean_pinball': None,
        'raw_coverage': None,
        'raw_width': None,
        'calibrated_slots': 0,
        'calibrated_coverage': None,
        'calibrated_width': None,
        'upper_exceedance': None,
        'lower_exceedance': None,
        'running_slots': 0,
        'running_calibrated_coverage': None,
    }
    if scored.empty:
        result['status'] = 'no_eligible_slots'
        return result

    # Raw quantiles: pinball loss per quantile, error of the median, raw q05-q95 interval.
    target = scored['target'].to_numpy()
    pinball_q05 = pinball_loss(target, scored['q05'].to_numpy(), .05)
    pinball_q50 = pinball_loss(target, scored['q50'].to_numpy(), .5)
    pinball_q95 = pinball_loss(target, scored['q95'].to_numpy(), .95)
    inside_raw_interval = (target >= scored['q05']) & (target <= scored['q95'])
    result.update(status='ok',
                  mae=float(np.abs(target - scored['q50']).mean()),
                  mean_pinball=float(np.mean([pinball_q05, pinball_q50, pinball_q95])),
                  pinball_q05=pinball_q05,
                  pinball_q50=pinball_q50,
                  pinball_q95=pinball_q95,
                  raw_coverage=float(inside_raw_interval.mean()),
                  raw_width=float((scored['q95'] - scored['q05']).mean()))

    # Calibrated (CQR) interval, on the slots that have both bounds.
    calibrated = scored.dropna(subset=['lower', 'upper'])
    result['calibrated_slots'] = len(calibrated)
    if len(calibrated):
        inside_calibrated = calibrated['target'].between(calibrated['lower'], calibrated['upper'])
        result['calibrated_coverage'] = float(inside_calibrated.mean())
        result['calibrated_width'] = float((calibrated['upper'] - calibrated['lower']).mean())
        # Each side of the band on its own: a detector reads "above the upper bound" as
        # excess use, so this share is the false-signal rate of a single slot.
        result['upper_exceedance'] = float((calibrated['target'] > calibrated['upper']).mean())
        result['lower_exceedance'] = float((calibrated['target'] < calibrated['lower']).mean())
        # Off slots sit on a lower bound of 0 and flatter the overall coverage,
        # so coverage is also reported for the slots where the unit runs.
        running = calibrated.loc[calibrated['target'] > running_threshold]
        result['running_slots'] = len(running)
        if len(running):
            inside_while_running = running['target'].between(running['lower'], running['upper'])
            result['running_calibrated_coverage'] = float(inside_while_running.mean())
    return result


def grouped_metrics(predictions: pd.DataFrame, running_threshold: float) -> list[dict]:
    """Metrics per household, model and split, for the whole split and for each month.

    Two populations: daily-qualified slots (the comparison population) and all
    temperature-supported slots (a diagnostic only).
    """
    records = []
    for (household, model, split), group in predictions.groupby(['household_id', 'model', 'split'], sort=True):
        periods = [('all', group), *list(group.groupby('month', sort=True))]
        for month, frame in periods:
            populations = [('daily_qualified', frame['eligible']),
                           ('supported_slots_diagnostic', frame['slot_supported'])]
            for population, mask in populations:
                record = {'household_id': int(household), 'model': model,
                          'split': split, 'month': month, 'population': population}
                record.update(metrics(frame, mask, running_threshold))
                records.append(record)
    return records


def comparison_summary(predictions: pd.DataFrame, records: list[dict], candidate_ids: list[int],
                       running_threshold: float) -> dict:
    """Development-only screening of B1 against B0 on identical slot populations."""
    development = predictions.loc[predictions['split'].eq('development')]
    summaries = {}
    for model, frame in development.groupby('model', sort=True):
        household_records = [r for r in records if r['model'] == model and r['split'] == 'development'
                             and r['month'] == 'all' and r['population'] == 'daily_qualified']
        scored_records = [r for r in household_records if r['scored_slots']]
        fully_calibrated = sum(r['calibrated_slots'] == r['scored_slots'] and r['scored_slots'] > 0
                               for r in household_records)
        macro_pinball = None
        if scored_records:
            macro_pinball = float(np.mean([r['mean_pinball'] for r in scored_records]))
        summaries[model] = {'pooled': metrics(frame, frame['eligible'], running_threshold),
                            'households_with_scores': len(scored_records),
                            'households_fully_calibrated': fully_calibrated,
                            'macro_mean_pinball': macro_pinball}

    # Both models must be scored on exactly the same household-slot population.
    paired = development.pivot(index=['household_id', 'ts_utc'], columns='model', values='eligible')
    if set(paired.columns) != {'B0', 'B1'} or paired.isna().any().any() or not paired['B0'].equals(paired['B1']):
        raise ValueError('B0/B1 comparison populations must match exactly')

    b0 = summaries['B0']
    b1 = summaries['B1']
    all_calibrated = all(s['households_fully_calibrated'] == len(candidate_ids) for s in (b0, b1))
    pinball_improved = (b0['macro_mean_pinball'] is not None and b1['macro_mean_pinball'] is not None
                        and b1['macro_mean_pinball'] < b0['macro_mean_pinball'])
    b1_pooled = b1['pooled']
    coverage_ok = all_calibrated and .87 <= b1_pooled['calibrated_coverage'] <= .93
    width_ok = all_calibrated and b1_pooled['calibrated_width'] <= 1.10 * b0['pooled']['calibrated_width']
    if not all_calibrated:
        recommendation = 'insufficient_evidence'
    elif pinball_improved and coverage_ok and width_ok:
        recommendation = 'B1'
    else:
        recommendation = 'retain_B0'
    return {'evaluation_split': 'development',
            'test_accessed_for_selection': False,
            'models': summaries,
            'screening': {'all_households_calibrated': all_calibrated,
                          'macro_pinball_improved': pinball_improved,
                          'coverage_in_exploratory_band': coverage_ok,
                          'width_within_110pct_b0': width_ok},
            'recommendation': recommendation,
            'recommendation_scope': 'development-only screening; not release approval or statistical significance',
            'comparison_status': 'complete' if all_calibrated else 'incomplete_calibration_or_daily_support'}
