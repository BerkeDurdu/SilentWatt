"""Train/calibration/development-only multi-household B0 versus quantile boosting."""
from __future__ import annotations

from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.data.audit import training_cohort_record
from silentwatt_ml.data.daily import daily_quality
from silentwatt_ml.data.quality import electric_timestamps, slot_mask, valid_target, weather_frame
from silentwatt_ml.data.readers import iter_electric, require_files
from silentwatt_ml.models.baseline import _prepare_frame, fit_empirical, predict_empirical
from silentwatt_ml.models.calibration import QUANTILES, apply_calibration, calibrate, ordered_quantiles
from silentwatt_ml.models.evaluation import comparison_summary, grouped_metrics
from silentwatt_ml.provenance import provenance

FEATURES = ['temperature_c', 'local_hour']


@dataclass
class ComparisonResult:
    report: dict
    predictions: pd.DataFrame
    daily: pd.DataFrame
    fitted_models: dict


def _load_training_cohort(config: ProjectConfig, path: Path) -> tuple[pd.DataFrame, list[dict]]:
    cols = config.columns
    usecols = list(dict.fromkeys([cols['household_id'], cols['timestamp_15m'], cols['target'],
                                 *config.raw['cohort']['exclude_if_observed']]))
    end = pd.Timestamp(config.raw['splits_local_date']['development'][1], tz=config.timezone)
    chunks = []
    for chunk in iter_electric(path, usecols=usecols):
        ts = electric_timestamps(chunk[cols['timestamp_15m']])
        if ts.isna().any():
            raise ValueError('Invalid source timestamps; resolve source audit first')
        # Test readings are excluded before target cleaning, features, fitting or quality metrics.
        chunk = chunk.loc[ts.lt(end)].copy()
        chunk['_ts'] = ts.loc[chunk.index]
        chunks.append(chunk)
    frame = pd.concat(chunks, ignore_index=True)
    ids = pd.to_numeric(frame[cols['household_id']], errors='coerce')
    if (~np.isfinite(ids) | ids.ne(ids.round())).any():
        raise ValueError('Invalid household identifiers')
    if frame['_ts'].ne(frame['_ts'].dt.floor('15min')).any():
        raise ValueError('Off-grid source timestamps; resolve source audit first')
    frame['_target'] = valid_target(frame[cols['target']])
    start, end = (pd.Timestamp(s, tz=config.timezone)
                  for s in config.raw['splits_local_date']['train'])
    expected = int((end - start).total_seconds() / 900)
    records = []
    for household, group in frame.groupby(cols['household_id'], sort=True):
        train = group.loc[group['_ts'].ge(start) & group['_ts'].lt(end)]
        duplicates = train['_ts'].duplicated(keep=False)
        clean = train.loc[~duplicates & slot_mask(train['_ts'], config)]
        records.append({'household_id': int(household),
                        **training_cohort_record(clean, bool(duplicates.any()), config, expected)})
    return frame, records


def _split(frame: pd.DataFrame, config: ProjectConfig, name: str) -> pd.DataFrame:
    lo, hi = config.raw['splits_local_date'][name]
    return frame.loc[frame['local_date'].ge(lo) & frame['local_date'].lt(hi)].copy()


def _run_household(config: ProjectConfig, paths: dict, household: int, raw: pd.DataFrame,
                   weather: pd.DataFrame) -> tuple[list[pd.DataFrame], pd.DataFrame, dict, dict]:
    from sklearn.ensemble import HistGradientBoostingRegressor
    from threadpoolctl import threadpool_limits

    p1 = config.raw['p1']
    end = pd.Timestamp(config.raw['splits_local_date']['development'][1], tz=config.timezone)
    frame, source_quality = _prepare_frame(config, paths, household, raw=raw, weather=weather, end_before=end)
    initial, _ = daily_quality(frame, config.timezone, p1['daily_quality'])
    train = _split(initial, config, 'train')
    train = train.loc[train['eligible']]
    models, predictions = {}, []
    model_parameters = None
    temperature_range = None
    if len(train):
        temperature_range = (float(train['temperature_c'].min()), float(train['temperature_c'].max()))
        model_parameters = fit_empirical(train, config.raw['baseline'])
        # Fixed single-thread execution avoids oversubscription and keeps comparisons reproducible.
        with threadpool_limits(limits=1):
            models = {str(q): HistGradientBoostingRegressor(
                loss='quantile', quantile=q, early_stopping=False,
                **p1['quantile_model']).fit(train[FEATURES], train['target'])
                for q in (.05, .5, .95)}
    qualified, days = daily_quality(frame, config.timezone, p1['daily_quality'], temperature_range)
    days['household_id'] = household
    days['split'] = 'unused'
    for split in ('train', 'calibration', 'development'):
        lo, hi = config.raw['splits_local_date'][split]
        days.loc[days['local_date'].ge(lo) & days['local_date'].lt(hi), 'split'] = split
    days = days.loc[days['split'].ne('unused')].copy()
    metadata = {'household_id': household, 'training_rows': len(train),
                'training_days': int(train['local_date'].nunique()),
                'training_temperature_range_c': temperature_range,
                'source_quality_before_development_end': source_quality,
                'B0_parameters': model_parameters, 'calibration': {}}
    for name in ('B0', 'B1'):
        frames = {}
        for split in ('calibration', 'development'):
            part = _split(qualified, config, split)
            if part.empty:
                raise ValueError(f'{split} has no expected slots')
            if model_parameters is None:
                part[QUANTILES] = np.nan
                part['eligible'] = False
                part['slot_supported'] = False
                part['prediction_status'] = 'training_pending'
            elif name == 'B0':
                part = predict_empirical(part, model_parameters)
            else:
                part[QUANTILES] = np.nan
                support = part['temperature_c'].between(*temperature_range)
                if support.any():
                    with threadpool_limits(limits=1):
                        part.loc[support, QUANTILES] = np.column_stack([
                            models[str(q)].predict(part.loc[support, FEATURES]) for q in (.05, .5, .95)])
                part['prediction_status'] = np.where(part['temperature_c'].isna(), 'missing_weather',
                                                    np.where(support, 'ok', 'temperature_out_of_support'))
            finite = np.isfinite(part[QUANTILES]).all(axis=1)
            part.loc[finite, QUANTILES] = ordered_quantiles(part.loc[finite, QUANTILES].to_numpy())
            part['eligible'] &= finite
            part['slot_supported'] &= finite
            part['household_id'] = household
            part['model'] = name
            part['split'] = split
            part['month'] = part['local_date'].str[:7]
            frames[split] = part
        profile = calibrate(frames['calibration'], p1['calibration'])
        metadata['calibration'][name] = profile
        for part in frames.values():
            predictions.append(apply_calibration(part, profile))
    return predictions, days, metadata, models


def run_comparison(config: ProjectConfig, data_dir: Path) -> ComparisonResult:
    if 'p1' not in config.raw:
        raise ValueError('P1 settings are required for comparison')
    paths = require_files(data_dir, {k: config.files[k] for k in ('electric_15m', 'weather')})
    raw, cohort = _load_training_cohort(config, paths['electric_15m'])
    candidates = [r['household_id'] for r in cohort if r['candidate']]
    if not candidates:
        raise ValueError('No candidates under unchanged training cohort rules')
    _, weather = weather_frame(paths['weather'], config)
    predictions, days, metadata, fitted = [], [], [], {}
    for household in candidates:
        group = raw.loc[raw[config.columns['household_id']].eq(household)]
        predicted, daily, meta, models = _run_household(config, paths, household, group, weather)
        predictions.extend(predicted)
        days.append(daily)
        metadata.append(meta)
        fitted[household] = models
    predictions = pd.concat(predictions, ignore_index=True).sort_values(['household_id', 'model', 'split', 'ts_utc'])
    records = grouped_metrics(predictions)
    report = {
        'schema_version': 'p1-1.0', 'protocol': config.raw['p1'],
        'source_unit': 'source_unit_unverified', 'evaluation_split': 'development',
        'provenance': provenance(config, paths), 'feature_order': FEATURES,
        'model_specification': {
            'B0': 'temperature_hour_empirical_quantiles',
            'B1': 'sklearn.ensemble.HistGradientBoostingRegressor',
            'loss': 'quantile', 'quantiles': [.05, .5, .95],
            'early_stopping': False, 'threadpool_limit': 1,
            'prediction_preprocessing': 'nonnegative_clipping_then_ascending_sort',
        },
        'model_runtime': {name: version(name) for name in
                          ('scikit-learn', 'scipy', 'joblib', 'threadpoolctl', 'narwhals', 'cloudpickle')},
        'candidate_household_ids': candidates, 'cohort': cohort, 'households': metadata,
        'metrics': records, 'comparison': comparison_summary(predictions, records, candidates),
        'limitations': [
            'Physical units, interval semantics and device mapping remain unverified.',
            'Cohort candidates are not certified healthy devices or final team-approved households.',
            'CQR is empirical here; temporal dependence and seasonal shift preclude an automatic coverage guarantee.',
            'Calibration coverage is in-sample fit diagnostics, not an evaluation result.',
            'Frozen-positive-run policy is a provisional sensor-quality suspicion, not proof of failure.',
            'File hashes include the entire source, but test readings do not fit, calibrate, score or select models.',
            'Point metrics are not fault/event detection performance or savings evidence.',
        ],
    }
    return ComparisonResult(report, predictions, pd.concat(days, ignore_index=True), fitted)
