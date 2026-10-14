from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from silentwatt_ml.config import load_config
from silentwatt_ml.data.audit import build_audit
from silentwatt_ml.models.baseline import run_baseline


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False))


def _output_path(value: str, data_dir: Path) -> Path:
    path = Path(value).expanduser().resolve()
    if path.is_relative_to(data_dir):
        raise ValueError("Outputs must be outside the read-only dataset directory")
    if path.exists():
        raise FileExistsError(f"Output already exists; choose a new run path: {path}")
    return path


def _audit(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    output = _output_path(args.output, data_dir)
    report = build_audit(config, data_dir)
    _write_json(output, report)
    print(f"Audit written to {output}")
    print(f"Candidate households: {len(report['candidate_household_ids'])}")
    return 0


def _baseline(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    output_dir = _output_path(args.output_dir, data_dir)
    result = run_baseline(
        config,
        data_dir,
        household_id=args.household_id,
        evaluation_split=args.evaluation_split,
        allow_test=args.allow_test,
    )
    output_dir.mkdir(parents=True, exist_ok=False)
    _write_json(
        output_dir / "metrics.json",
        {"metrics": result.metrics.to_dict(), "metadata": result.metadata},
    )
    result.predictions.to_csv(output_dir / "predictions.csv", index=False)
    print(f"Baseline artifacts written to {output_dir}")
    print(json.dumps(result.metrics.to_dict(), indent=2))
    return 0


def _compare(args: argparse.Namespace) -> int:
    # Modeling extras are optional for the original audit/baseline commands.
    import joblib

    from silentwatt_ml.data.readers import sha256_file
    from silentwatt_ml.models.comparison import run_comparison

    config = load_config(args.config)
    data_dir = Path(args.data_dir).expanduser().resolve()
    output = _output_path(args.output_dir, data_dir)
    result = run_comparison(config, data_dir)
    output.mkdir(parents=True, exist_ok=False)
    result.predictions.to_csv(output / "predictions.csv", index=False)
    result.daily.to_csv(output / "daily-quality.csv", index=False)
    joblib.dump(result.fitted_models, output / "B1-models.joblib", compress=3)
    result.report["artifact_sha256"] = {
        name: sha256_file(output / name)
        for name in ("predictions.csv", "daily-quality.csv", "B1-models.joblib")
    }
    _write_json(output / "report.json", result.report)
    print(f"Development comparison written to {output}")
    print(json.dumps(result.report["comparison"], indent=2, allow_nan=False))
    return 0


def _detect(args: argparse.Namespace) -> int:
    from silentwatt_ml.detection.pipeline import run_detection, write_run

    config = load_config(args.config)
    if "detector" not in config.raw:
        raise ValueError("The config has no detector section (see configs/ml/austin-2018-detect.json)")
    data_dir = Path(args.data_dir).expanduser().resolve()
    output = _output_path(args.output, data_dir)
    index, files, report = run_detection(config, data_dir, args.run_id or output.name)
    write_run(output, index, files, report)
    if args.set_current:
        # The console reads this pointer when SILENTWATT_EVIDENCE_DIR is not set (server/config.ts).
        pointer = output.parent / "CURRENT"
        pointer.write_text(output.name + "\n", encoding="utf-8")
        print(f"Console pointer: {pointer} -> {output.name}")
    evaluation = index["evaluation"]
    print(f"Evidence written to {output}")
    print(f"Observed cases: {sum(1 for c in index['cases'] if c['origin'] == 'observed')} · "
          f"validation scenarios detected: {evaluation['synthetic_detected']}/{evaluation['synthetic_cases']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="silentwatt-ml")
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit", help="Profile source coverage and candidate cohort")
    audit.add_argument("--data-dir", default=os.getenv("SILENTWATT_DATA_DIR"), required=not os.getenv("SILENTWATT_DATA_DIR"))
    audit.add_argument("--config", default=os.getenv("SILENTWATT_ML_CONFIG", "configs/ml/austin-2018.json"))
    audit.add_argument("--output", default="artifacts/data-audit.json")
    audit.set_defaults(handler=_audit)

    baseline = subparsers.add_parser("baseline", help="Run the empirical quantile baseline")
    baseline.add_argument("--data-dir", default=os.getenv("SILENTWATT_DATA_DIR"), required=not os.getenv("SILENTWATT_DATA_DIR"))
    baseline.add_argument("--config", default=os.getenv("SILENTWATT_ML_CONFIG", "configs/ml/austin-2018.json"))
    baseline.add_argument("--household-id", type=int, required=True)
    baseline.add_argument("--output-dir", required=True)
    baseline.add_argument("--evaluation-split", choices=["development", "test"], default="development")
    baseline.add_argument("--allow-test", action="store_true", help="Explicitly unlock final evaluation after freezing experiments")
    baseline.set_defaults(handler=_baseline)

    compare = subparsers.add_parser("compare", help="Calibrate and compare B0/B1 on development only")
    compare.add_argument("--data-dir", default=os.getenv("SILENTWATT_DATA_DIR"), required=not os.getenv("SILENTWATT_DATA_DIR"))
    compare.add_argument("--config", default=os.getenv("SILENTWATT_ML_CONFIG", "configs/ml/austin-2018.json"))
    compare.add_argument("--output-dir", required=True)
    compare.set_defaults(handler=_compare)
    detect = subparsers.add_parser("detect", help="Run the detector on June/July and write evidence files (v0.2)")
    detect.add_argument("--config", default=os.environ.get("SILENTWATT_ML_CONFIG", "configs/ml/austin-2018-detect.json"))
    detect.add_argument("--data-dir", default=os.environ.get("SILENTWATT_DATA_DIR", "../dataset"))
    detect.add_argument("--output", required=True, help="New evidence directory, e.g. artifacts/evidence/<run-id>")
    detect.add_argument("--run-id", default=None)
    detect.add_argument("--set-current", action="store_true", help="Point the local console at this run (artifacts/evidence/CURRENT)")
    detect.set_defaults(handler=_detect)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    raise SystemExit(args.handler(args))
