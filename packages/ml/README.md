# SilentWatt ML

This package contains Role C's offline audit and empirical baseline. Calibration, event detection and evidence generation are planned, not implemented. Role B owns production ingestion and orchestration; the shared quality rules here must be reused or moved together, not independently reimplemented.

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

The optional `dev`/`modeling` extras are not part of this validated foundation lock or required installation. CI runs standard-library tests without pytest. Python 3.12 is the tested team runtime; other Python versions are not CI-validated.

## Boundaries

- Source CSV files are read-only.
- `air1` is a conditional target pending provider metadata confirmation.
- Source values remain `source_unit_unverified` until the power unit is confirmed.
- Cohort candidates use valid training-period coverage and training-period exclusion channels only. Annual audit statistics are descriptive inventory. Candidates are not certified healthy or ready for deployment.
- Generated results are artifacts, not product claims.

Run the unit tests without installing pytest:

```bash
python -m unittest discover -s packages/ml/tests -v
```
