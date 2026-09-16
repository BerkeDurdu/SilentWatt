# Data boundary

Large source datasets do not belong in Git. Pass `--data-dir` or export `SILENTWATT_DATA_DIR` pointing to a local or mounted directory containing:

- `1minute_data_austin.csv`
- `15minute_data_austin.csv`
- `open-meteo-30.26N97.69W157m.csv`

The source files are treated as immutable. Generated tables and models go to `artifacts/` or an external object store. The committed config records logical filenames; the audit records hashes and the observed 15-minute schema. Baseline needs only the 15-minute and weather files; audit needs all three. `.env` is not automatically loaded by Python.

Do not add household identifiers, raw readings, credentials, or downloaded model binaries to fixtures. Unit tests create small synthetic inputs at runtime.
