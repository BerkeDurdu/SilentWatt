# Generated artifacts

This directory is intentionally excluded from Git except for this file. Typical outputs are:

- `data-audit.json`
- `baseline/<household_id>/metrics.json`
- `baseline/<household_id>/predictions.csv`
- trained model bundles and evaluation reports

Each baseline run embeds the config, source hashes, package source hash, runtime versions and fitted tables. Its output directory identifies the run; publish it together with the Git commit and execution date. Audit reports include generation time. Local results do not establish validated fault-detection performance.

Older `baseline/661` output from the initial foundation evaluated the test split. Preserve it as exploratory history; it is not a final blind-test result. New runs default to the development split and require fresh directories.
