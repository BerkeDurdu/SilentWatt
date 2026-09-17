# SilentWatt ML

This package contains Role C's offline audit, empirical baseline, daily quality gates, split CQR calibration and development-only multi-household quantile-model comparison. Event detection and product evidence generation remain planned. Role B owns production ingestion and orchestration; the shared quality rules here must be reused or moved together, not independently reimplemented.

## First working slice

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r packages/ml/requirements.lock
python -m pip install --no-build-isolation -c packages/ml/requirements.lock -e packages/ml
python -m pip check

silentwatt-ml audit \
  --data-dir ../dataset \
  --config configs/ml/austin-2018.json \
  --output artifacts/data-audit.json

silentwatt-ml baseline \
  --data-dir ../dataset \
  --config configs/ml/austin-2018.json \
  --household-id 661 \
  --output-dir artifacts/baseline/development-661-run01
```

The baseline learns target quantiles by outside-temperature bin and local hour, with temperature-only and global fallbacks. All tables use training data only. Observed hourly weather makes this a retrospective expected-consumption benchmark, not a future-weather forecast. No calibration or daily maintenance decision is performed.

Evaluation defaults to `development`. Final test requires both `--evaluation-split test --allow-test`, after model/config freeze. The flag records intentional access; it is not an access-control system. The initial foundation run already inspected household 661's test metrics: that historical result is exploratory, not a pristine blind holdout.

Every expected evaluation slot appears in `predictions.csv`. Missing/invalid targets, missing weather and temperatures outside the observed training range are explicit statuses. Unsupported predictions have no numeric quantile. Metrics use supported, valid rows only; always publish scored/expected counts and exclusion counts with coverage and width. Exclusion counts can overlap. Neither forecast error nor point coverage is an event-level detection metric.

`metrics.json` schema 1.1 contains the config snapshot/hash, source hashes, package source hash, runtime versions and fitted quantile tables. A source hash identifies content, including uncommitted code. Repeating the same inputs and environment produces identical baseline files. Use a fresh output directory per run; existing results and dataset paths cannot be overwritten.

The base lock still supports standalone audit/baseline. P1 comparison and the full test suite additionally require `requirements-modeling.lock`; CI uses that lock with the `modeling` extra. Tests use standard-library unittest, without pytest. Python 3.12 is the tested team runtime.

## Boundaries

- Source CSV files are read-only.
- `air1` is a conditional target pending provider metadata confirmation.
- Source values remain `source_unit_unverified` until the power unit is confirmed.
- Cohort candidates use valid training-period coverage and training-period exclusion channels only. Annual audit statistics are descriptive inventory. Candidates are not certified healthy or ready for deployment.
- Generated results are artifacts, not product claims.

After installing the P1 modeling lock below, run all unit tests without pytest:

```bash
python -m unittest discover -s packages/ml/tests -v
```

## P1: calibrated multi-household development comparison

```bash
.venv/bin/python -m pip install -r packages/ml/requirements-modeling.lock
.venv/bin/python -m pip install --no-build-isolation \
  -c packages/ml/requirements-modeling.lock -e 'packages/ml[modeling]'
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 .venv/bin/python -m silentwatt_ml compare \
  --data-dir ../dataset --config configs/ml/austin-2018.json \
  --output-dir artifacts/p1/development-run01
```

Use a fresh output directory. This command has no test option: only training
fits B0/B1, only calibration fits per-household qhat, and only development screens
models. Source files are hashed in full, but test readings never enter cleaning,
feature tables, model fitting, calibration, metrics or selection in this command.
The minute file is not required. Candidate selection reuses the audit's training
contract; a daily gate cannot silently alter the recorded candidate cohort.

Outputs:

- `report.json`: config/source/code/runtime provenance, cohort reasons, B0 tables,
  feature order, B1 settings, calibration profiles, household/month metrics,
  paired development screening, and hashes of the other output files.
- `predictions.csv`: all expected calibration/development slots for both models,
  raw ordered q05/q50/q95, calibrated lower/upper (null when pending), per-slot
  and daily eligibility/status. Calibration metrics are in-sample diagnostics.
- `daily-quality.csv`: train/calibration/development local-day denominators,
  missing/null/negative/invalid/weather/freeze/support counts and exclusion reasons.
- `B1-models.joblib`: locally fitted B1 estimators by household/quantile. These
  files are generated internally; no loader for untrusted model files is supplied.

Calibration requires 14 qualified days and 1,000 supported slots per household;
insufficient data stays `calibration_pending` with null bounds. Quantiles are
clipped/reordered before calibration, and qhat cannot shrink the raw interval.
Pointwise empirical coverage is neither event recall nor a fault probability.

The original `baseline` command remains uncalibrated and exploratory. The P1 B0
uses the same estimator on **daily-qualified** training rows, so its metrics must
not be described as identical to the old all-valid-slot baseline.

Daily gates use the PRD's 95% joint coverage and DST-aware 92/96/100-slot days.
Any temperature outside the fitted train range blocks that day. Exact positive
runs of 16 slots trigger provisional freeze suspicion, using past values only;
zero/off runs are exempt. This is a research policy, not a validated sensor-fault
threshold. It can exclude legitimate low-power standby operation and substantially
reduce training data. See the [frozen protocol](../../docs/architecture/p1-ml-protocol.md)
and [measured P1 report](../../docs/project-status/p1-ml-results-2026-09-17.md).
