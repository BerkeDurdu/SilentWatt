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
    return parser


def main() -> None:
    args = build_parser().parse_args()
    raise SystemExit(args.handler(args))
