# Data boundary

Large source datasets do not belong in Git. Pass `--data-dir` or export `SILENTWATT_DATA_DIR` pointing to a local or mounted directory containing:

- `1minute_data_austin.csv`
- `15minute_data_austin.csv`
- `open-meteo-30.26N97.69W157m.csv`

The same directory also holds the Dataport household metadata, `metadata_pecanstreetdata.csv` (2,072 households, 130 columns, added on 2026-09-27). It is not listed in the config and is not read by the `silentwatt-ml` commands; the review scripts in `docs/product/ekler/` take it through `--metadata`. Its circuit flags describe the configured circuits of a home, not whether data exists in 2018.

The source files are treated as immutable. Generated tables and models go to `artifacts/` or an external object store. The committed config records logical filenames; the audit records hashes and the observed 15-minute schema. Baseline needs only the 15-minute and weather files; audit needs all three. `.env` is not automatically loaded by Python.

Do not add household identifiers, raw readings, credentials, or downloaded model binaries to fixtures. Unit tests create small synthetic inputs at runtime.
