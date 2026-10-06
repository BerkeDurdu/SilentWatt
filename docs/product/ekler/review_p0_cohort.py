"""Training-only P0 cohort diagnostics; does not change selection or source values.

Run from repository root with the installed silentwatt_ml package. JSON goes to
stdout; keep generated reports under artifacts/. The supplied audit must describe
these exact sources/config. Sensitivity counts are counterfactual, not approvals.
"""
from __future__ import annotations

import argparse
import json
import math
from itertools import groupby
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import load_config
from silentwatt_ml.data.quality import electric_timestamps, valid_target
from silentwatt_ml.data.readers import iter_electric, require_files, sha256_file


# Hypothetical negative tolerances (source units) reported as counts, never applied.
NEGATIVE_TOLERANCES = (0, 0.001, 0.005, 0.01)


def longest_invalid_run(valid: list[bool]) -> int:
    return max((sum(1 for _ in group) for value, group in groupby(valid) if not value), default=0)


def household_diagnostics(household_id: int, group: pd.DataFrame, grid: pd.DatetimeIndex,
                          config, audit_record: dict) -> dict:
    """Slot accounting, value profile and tolerance counts of one household's train window."""
    columns = config.columns
    exclusions = config.raw['cohort']['exclude_if_observed']
    expected = len(grid)
    readings = pd.to_numeric(group.set_index('_ts')[columns['target']], errors='coerce').reindex(grid)
    finite = np.isfinite(readings)
    valid = valid_target(readings).notna()
    negative = readings[finite & readings.lt(0)]
    observed = [channel for channel in exclusions if group[channel].notna().any()]
    valid_count = int(valid.sum())
    # The package audit and this diagnostic must agree slot for slot.
    agrees_with_audit = (valid_count == audit_record['training_valid_target_slots']
                         and observed == audit_record['observed_training_exclusion_channels'])
    if not agrees_with_audit:
        raise ValueError(f'Diagnostics disagree with package audit for {household_id}')

    absent = expected - len(group)
    negative_quantiles = {}
    if len(negative):
        negative_quantiles = {str(q): float(negative.quantile(q)) for q in (0, 0.5, 1)}
    monthly = valid.groupby(grid.tz_convert(config.timezone).strftime('%Y-%m'))
    channel_counts = {}
    for channel in exclusions:
        channel_values = pd.to_numeric(group[channel], errors='coerce')
        channel_counts[channel] = {'nonnull': int(group[channel].notna().sum()),
                                   'positive': int(channel_values.gt(0).sum())}
    tolerance_counts = {str(tolerance): int((finite & readings.ge(-tolerance)).sum())
                        for tolerance in NEGATIVE_TOLERANCES}
    return {
        'household_id': household_id,
        'expected_slots': expected,
        'present_slots': len(group),
        'absent_slots': absent,
        'null_or_nonfinite_present_slots': int((~finite).sum()) - absent,
        'negative_slots': len(negative),
        'valid_slots': valid_count,
        'valid_coverage': valid_count / expected,
        'finite_coverage': int(finite.sum()) / expected,
        'negative_quantiles_source_unit': negative_quantiles,
        'zero_slots': int(readings.eq(0).sum()),
        'positive_slots': int(readings.gt(0).sum()),
        'longest_invalid_run_slots': longest_invalid_run(valid.tolist()),
        'monthly_valid_coverage': {month: float(month_valid.mean()) for month, month_valid in monthly},
        'observed_exclusion_channels': observed,
        'exclusion_channel_counts': channel_counts,
        'air3_nonnull': int(group['air3'].notna().sum()),
        'candidate': audit_record['candidate'],
        'exclusion_reasons': audit_record['exclusion_reasons'],
        'valid_slots_at_negative_tolerance': tolerance_counts,
    }


def review(config_path: str, data_dir: str, audit_path: str) -> dict:
    """Train-only diagnostics of the P0 cohort, checked slot for slot against the package audit."""
    config = load_config(config_path)
    audit = json.loads(Path(audit_path).read_text())
    # The diagnostics only describe the exact config and source file the audit used.
    if config.raw != audit['provenance']['config']:
        raise ValueError('Config differs from audit')
    path = require_files(Path(data_dir), config.files)['electric_15m']
    if sha256_file(path) != audit['provenance']['source_sha256']['electric_15m']:
        raise ValueError('15m source differs from audit')

    columns = config.columns
    household_column = columns['household_id']
    exclusions = config.raw['cohort']['exclude_if_observed']
    # air3 is a diagnostic only; it is not silently added to the cohort rule.
    usecols = list(dict.fromkeys([household_column, columns['timestamp_15m'],
                                  columns['target'], *exclusions, 'air3']))
    frame = pd.concat(iter_electric(path, usecols=usecols), ignore_index=True)
    frame['_ts'] = electric_timestamps(frame[columns['timestamp_15m']])
    if frame['_ts'].isna().any():
        raise ValueError('Unexpected invalid timestamps; inspect with package audit')

    # Train window only, on a clean key grid.
    train_start = pd.Timestamp(config.raw['splits_local_date']['train'][0], tz=config.timezone)
    train_end = pd.Timestamp(config.raw['splits_local_date']['train'][1], tz=config.timezone)
    frame = frame.loc[frame['_ts'].ge(train_start) & frame['_ts'].lt(train_end)].copy()
    if frame.duplicated([household_column, '_ts']).any():
        raise ValueError('Duplicate training keys; diagnostics require a clean key grid')
    if frame['_ts'].ne(frame['_ts'].dt.floor('15min')).any():
        raise ValueError('Off-grid training timestamps')
    grid = pd.date_range(train_start.tz_convert('UTC'), train_end.tz_convert('UTC'),
                         freq='15min', inclusive='left')
    expected = len(grid)
    if expected != audit['electric_15m']['expected_training_slots_per_household']:
        raise ValueError('Training denominator differs from audit')

    minimum = config.raw['cohort']['minimum_target_coverage']
    audit_by_household = {h['household_id']: h for h in audit['households']}
    households = []
    for household, group in frame.groupby(household_column):
        household_id = int(household)
        households.append(household_diagnostics(household_id, group, grid, config,
                                                audit_by_household[household_id]))
    if set(audit_by_household) != {h['household_id'] for h in households}:
        raise ValueError('A household has no training rows; use package audit for that case')

    # Counterfactual counts only: how many candidates other thresholds would give.
    coverage_sensitivity = []
    for threshold in (0.90, 0.93, 0.94, minimum, 0.97, 0.99):
        ids = [h['household_id'] for h in households
               if h['valid_coverage'] >= threshold and not h['observed_exclusion_channels']]
        coverage_sensitivity.append({'minimum_coverage': threshold, 'count': len(ids), 'ids': ids})
    tolerance_sensitivity = []
    for tolerance in NEGATIVE_TOLERANCES:
        ids = [h['household_id'] for h in households
               if h['valid_slots_at_negative_tolerance'][str(tolerance)] / expected >= minimum
               and not h['observed_exclusion_channels']]
        tolerance_sensitivity.append({'hypothetical_negative_tolerance_source_unit': tolerance,
                                      'count': len(ids), 'ids': ids})

    # Every expected slot is absent, null or non-finite, negative, or valid.
    for h in households:
        accounted = h['absent_slots'] + h['null_or_nonfinite_present_slots'] + h['negative_slots'] + h['valid_slots']
        if accounted != expected:
            raise ValueError('Coverage accounting does not conserve expected slots')
    return {'scope': 'training diagnostics only; sensitivities are not policy changes',
            'audit_provenance': audit['provenance'],
            'expected_training_slots': expected,
            'minimum_valid_slots': math.ceil(minimum * expected),
            'candidate_household_ids': audit['candidate_household_ids'],
            'households': households,
            'coverage_sensitivity': coverage_sensitivity,
            'negative_tolerance_sensitivity': tolerance_sensitivity}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='configs/ml/austin-2018.json')
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--audit', required=True)
    args = parser.parse_args()
    # Small runnable check for contiguous-run accounting, including empty/all-valid cases.
    assert longest_invalid_run([]) == 0
    assert longest_invalid_run([True, True]) == 0
    assert longest_invalid_run([False, True, False, False, True]) == 2
    print(json.dumps(review(args.config, args.data_dir, args.audit), indent=2, allow_nan=False))
