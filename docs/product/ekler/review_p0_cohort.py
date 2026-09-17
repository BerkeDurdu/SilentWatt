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


def longest_invalid_run(valid: list[bool]) -> int:
    return max((sum(1 for _ in group) for value, group in groupby(valid) if not value), default=0)


def review(config_path: str, data_dir: str, audit_path: str) -> dict:
    config = load_config(config_path)
    audit = json.loads(Path(audit_path).read_text())
    if config.raw != audit['provenance']['config']:
        raise ValueError('Config differs from audit')
    path = require_files(Path(data_dir), config.files)['electric_15m']
    if sha256_file(path) != audit['provenance']['source_sha256']['electric_15m']:
        raise ValueError('15m source differs from audit')
    cols = config.columns
    exclusions = config.raw['cohort']['exclude_if_observed']
    # air3 is a diagnostic only; it is not silently added to the cohort rule.
    usecols = list(dict.fromkeys([cols['household_id'], cols['timestamp_15m'],
                                 cols['target'], *exclusions, 'air3']))
    frame = pd.concat(iter_electric(path, usecols=usecols), ignore_index=True)
    frame['_ts'] = electric_timestamps(frame[cols['timestamp_15m']])
    if frame['_ts'].isna().any():
        raise ValueError('Unexpected invalid timestamps; inspect with package audit')
    start, end = (pd.Timestamp(s, tz=config.timezone)
                  for s in config.raw['splits_local_date']['train'])
    frame = frame.loc[frame['_ts'].ge(start) & frame['_ts'].lt(end)].copy()
    if frame.duplicated([cols['household_id'], '_ts']).any():
        raise ValueError('Duplicate training keys; diagnostics require a clean key grid')
    if frame['_ts'].ne(frame['_ts'].dt.floor('15min')).any():
        raise ValueError('Off-grid training timestamps')
    grid = pd.date_range(start.tz_convert('UTC'), end.tz_convert('UTC'),
                         freq='15min', inclusive='left')
    expected = len(grid)
    if expected != audit['electric_15m']['expected_training_slots_per_household']:
        raise ValueError('Training denominator differs from audit')
    minimum = config.raw['cohort']['minimum_target_coverage']
    by_id = {h['household_id']: h for h in audit['households']}
    households = []
    for household, group in frame.groupby(cols['household_id']):
        hid = int(household)
        numeric = pd.to_numeric(group.set_index('_ts')[cols['target']], errors='coerce').reindex(grid)
        finite = np.isfinite(numeric)
        valid = valid_target(numeric).notna()
        negative = numeric[finite & numeric.lt(0)]
        observed = [c for c in exclusions if group[c].notna().any()]
        count = int(valid.sum())
        original = by_id[hid]
        if count != original['training_valid_target_slots'] or observed != original['observed_training_exclusion_channels']:
            raise ValueError(f'Diagnostics disagree with package audit for {hid}')
        monthly = valid.groupby(grid.tz_convert(config.timezone).strftime('%Y-%m'))
        households.append({
            'household_id': hid, 'expected_slots': expected, 'present_slots': len(group),
            'absent_slots': expected - len(group),
            'null_or_nonfinite_present_slots': int((~finite).sum()) - (expected - len(group)),
            'negative_slots': len(negative), 'valid_slots': count,
            'valid_coverage': count / expected, 'finite_coverage': int(finite.sum()) / expected,
            'negative_quantiles_source_unit': {str(q): float(negative.quantile(q))
                for q in (0, 0.5, 1)} if len(negative) else {},
            'zero_slots': int(numeric.eq(0).sum()), 'positive_slots': int(numeric.gt(0).sum()),
            'longest_invalid_run_slots': longest_invalid_run(valid.tolist()),
            'monthly_valid_coverage': {month: float(values.mean()) for month, values in monthly},
            'observed_exclusion_channels': observed,
            'exclusion_channel_counts': {c: {'nonnull': int(group[c].notna().sum()),
                'positive': int(pd.to_numeric(group[c], errors='coerce').gt(0).sum())} for c in exclusions},
            'air3_nonnull': int(group['air3'].notna().sum()),
            'candidate': original['candidate'], 'exclusion_reasons': original['exclusion_reasons'],
            'valid_slots_at_negative_tolerance': {str(eps): int((finite & numeric.ge(-eps)).sum())
                for eps in (0, 0.001, 0.005, 0.01)},
        })
    if set(by_id) != {h['household_id'] for h in households}:
        raise ValueError('A household has no training rows; use package audit for that case')
    sensitivity = []
    for threshold in (0.90, 0.93, 0.94, minimum, 0.97, 0.99):
        ids = [h['household_id'] for h in households
               if h['valid_coverage'] >= threshold and not h['observed_exclusion_channels']]
        sensitivity.append({'minimum_coverage': threshold, 'count': len(ids), 'ids': ids})
    tolerance = []
    for eps in (0, 0.001, 0.005, 0.01):
        ids = [h['household_id'] for h in households
               if h['valid_slots_at_negative_tolerance'][str(eps)] / expected >= minimum
               and not h['observed_exclusion_channels']]
        tolerance.append({'hypothetical_negative_tolerance_source_unit': eps,
                          'count': len(ids), 'ids': ids})
    for h in households:
        if h['absent_slots'] + h['null_or_nonfinite_present_slots'] + h['negative_slots'] + h['valid_slots'] != expected:
            raise ValueError('Coverage accounting does not conserve expected slots')
    return {'scope': 'training diagnostics only; sensitivities are not policy changes',
            'audit_provenance': audit['provenance'], 'expected_training_slots': expected,
            'minimum_valid_slots': math.ceil(minimum * expected),
            'candidate_household_ids': audit['candidate_household_ids'],
            'households': households, 'coverage_sensitivity': sensitivity,
            'negative_tolerance_sensitivity': tolerance}


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
