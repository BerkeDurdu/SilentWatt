"""Read-only source profiling for the SilentWatt PRD. Writes only a JSON audit."""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
import pandas as pd

# Historical PRD inventory method. Operational cohort rules live in silentwatt_ml.
DATA_DIR = None
OUT = None
BASE = pd.Timestamp('2018-01-01T06:00:00Z')
END = pd.Timestamp('2019-01-01T06:00:00Z')
CHANNELS = ['air1', 'air2', 'airwindowunit1', 'furnace1', 'furnace2', 'grid', 'solar', 'refrigerator1']

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def profile(name, tscol, minutes):
    path = DATA_DIR / name
    header = pd.read_csv(path, nrows=0).columns.tolist()
    use = header if minutes == 15 else ['dataid', tscol] + CHANNELS
    sums = {}; parts = {}; sample = []; rows = 0; bad = 0; offgrid = 0
    for chunk in pd.read_csv(path, usecols=use, chunksize=400_000):
        rows += len(chunk)
        ts = pd.to_datetime(chunk[tscol], utc=True, errors='coerce')
        bad += int(ts.isna().sum())
        chunk['_ts'] = ts
        offgrid += int(((ts.dt.second != 0) | (ts.dt.minute % minutes != 0)).sum())
        for did, g in chunk.groupby('dataid'):
            did = int(did)
            acc = sums.setdefault(did, {'rows': 0, 'channels': {}})
            acc['rows'] += len(g)
            keys = ((g['_ts'] - BASE).dt.total_seconds() // 60).to_numpy(dtype=np.int64)
            parts.setdefault(did, []).append(keys)
            for c in [c for c in use if c not in ['dataid', tscol]]:
                x = g[c]
                z = acc['channels'].setdefault(c, {'nonnull': 0, 'negative': 0, 'abs_gt_20': 0, 'min': None, 'max': None})
                z['nonnull'] += int(x.notna().sum())
                z['negative'] += int((x < 0).sum())
                z['abs_gt_20'] += int((x.abs() > 20).sum())
                if x.notna().any():
                    lo, hi = float(x.min()), float(x.max())
                    z['min'] = lo if z['min'] is None else min(lo, z['min'])
                    z['max'] = hi if z['max'] is None else max(hi, z['max'])
            if did == 661:
                sample.append(g[['_ts', 'air1', 'furnace1']].copy())
    duplicates = 0; expected = int((END-BASE).total_seconds()/60/minutes)
    all_lo = []; all_hi = []
    for did, arrays in parts.items():
        vals = np.concatenate(arrays)
        unique = np.unique(vals)
        duplicates += int(len(vals)-len(unique))
        z = sums[did]
        z['unique_timestamps'] = len(unique)
        z['duplicate_keys'] = int(len(vals)-len(unique))
        z['first_utc'] = str(BASE+pd.Timedelta(minutes=int(unique[0])))
        z['last_utc'] = str(BASE+pd.Timedelta(minutes=int(unique[-1])))
        z['missing_slots_in_austin_2018'] = expected - int(((unique >= 0) & (unique < 525600)).sum())
        z['max_gap_minutes'] = int(np.diff(unique).max()) if len(unique)>1 else 0
        all_lo.append(unique[0]); all_hi.append(unique[-1])
        for c, a in z['channels'].items():
            a['nonnull_fraction_of_existing_rows'] = a['nonnull']/z['rows']
            a['nonnull_fraction_of_expected_year_slots'] = a['nonnull']/expected
    summary = {}
    for c in [c for c in use if c not in ['dataid', tscol]]:
        summary[c] = {'homes_with_values': sum(x['channels'][c]['nonnull']>0 for x in sums.values()),
                      'nonnull': sum(x['channels'][c]['nonnull'] for x in sums.values())}
    print(name, rows, len(sums), 'duplicate_keys', duplicates, flush=True)
    result = {'file': name, 'bytes': path.stat().st_size, 'sha256': sha(path), 'rows': rows,
              'columns': header, 'profiled_channels': list(summary), 'homes': len(sums),
              'invalid_timestamps': bad, 'off_grid_rows': offgrid, 'duplicate_keys': duplicates,
              'expected_slots_per_home_austin_2018': expected,
              'first_utc': str(BASE+pd.Timedelta(minutes=int(min(all_lo)))),
              'last_utc': str(BASE+pd.Timedelta(minutes=int(max(all_hi)))),
              'channel_summary': summary, 'by_home': sums}
    return result, pd.concat(sample).sort_values('_ts').set_index('_ts')

def main():
    global DATA_DIR, OUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    DATA_DIR, OUT = args.data_dir.expanduser().resolve(), args.output.expanduser().resolve()
    if OUT.is_relative_to(DATA_DIR) or OUT.exists():
        raise ValueError('Choose a new output file outside the dataset directory')
    a, s15 = profile('15minute_data_austin.csv', 'local_15min', 15)
    b, s1 = profile('1minute_data_austin.csv', 'localminute', 1)
    p = DATA_DIR/'open-meteo-30.26N97.69W157m.csv'
    metadata = pd.read_csv(p, nrows=1).iloc[0].to_dict()
    w = pd.read_csv(p, skiprows=3)
    wt = pd.to_datetime(w['time'], utc=True, errors='coerce')
    temp = w['temperature_2m (°C)']
    weather = {'file':p.name, 'bytes':p.stat().st_size, 'sha256':sha(p), 'metadata':metadata,
               'columns':w.columns.tolist(), 'rows':len(w), 'first_utc':str(wt.min()), 'last_utc':str(wt.max()),
               'duplicate_timestamps':int(wt.duplicated().sum()),'invalid_timestamps':int(wt.isna().sum()),
               'missing_temperature':int(temp.isna().sum()),'min_temp_c':float(temp.min()),'max_temp_c':float(temp.max()),
               'gap_minutes':wt.sort_values().diff().dropna().dt.total_seconds().div(60).value_counts().to_dict()}
    comparison = {'scope':'Only household 661, full year; diagnostic not a provider aggregation contract.', 'alignment':'left-closed UTC quarter hour'}
    agg = s1.resample('15min',label='left',closed='left').agg(['mean','count'])
    for c in ['air1','furnace1']:
        merged = pd.concat([s15[c].rename('provided'), agg[(c,'mean')].rename('derived'),agg[(c,'count')].rename('count')],axis=1)
        valid = merged[(merged['count']==15)&merged.provided.notna()]
        err = (valid.provided-valid.derived).abs()
        comparison[c] = {'complete_paired_bins':len(valid), 'mean_abs_difference':float(err.mean()),
                         'p99_abs_difference':float(err.quantile(.99)), 'max_abs_difference':float(err.max()),
                         'fraction_within_0_0011':float((err<=.0011).mean())}
    candidates = [did for did,g in a['by_home'].items() if g['channels']['air1']['nonnull_fraction_of_expected_year_slots']>=.95 and g['channels']['air2']['nonnull']==0]
    strict = [did for did in candidates if a['by_home'][did]['channels']['airwindowunit1']['nonnull']==0]
    report = {'audit_date':'2026-09-15', 'scope':'Observed file contents; no physical fault labels, units, or device identities verified by this script.',
              'electric_15min':a,'electric_1min':b,'weather':weather,'resolution_comparison':comparison,
              'candidate_air1_ge95_expected_no_air2':candidates,'candidate_also_no_window_ac':strict}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('x', encoding='utf-8') as handle:
        handle.write(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False))
    print(json.dumps({'weather':weather,'comparison':comparison,'candidates':candidates,'strict':strict},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
