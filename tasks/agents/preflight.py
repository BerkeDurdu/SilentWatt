"""Start-of-task check for a SilentWatt agent, run from inside the agent's own worktree.

Why: on 2026-10-07 all three wave-1 worktrees were created from `main` instead of the task's
base commit, and the shared virtual environment imports the package from the main checkout
unless PYTHONPATH points at the worktree. This script catches both before any work starts.

Usage (from the worktree root):
    python3 tasks/agents/preflight.py --base <commit> [--artifacts-dir <absolute path>]

Checks, in order; the first failure stops with exit code 1:
1. The current directory is a linked git worktree, not the main checkout.
2. The worktree has no uncommitted changes.
3. HEAD contains the base commit. If HEAD is behind the base on the same line, the branch is
   fast-forwarded (`git merge --ff-only`), which rewrites nothing.
4. With PYTHONPATH set to this worktree, `silentwatt_ml` is imported from this worktree.
5. SILENTWATT_DATA_DIR is set and holds the three source files named in the project config.
6. The artifacts directory, if given, is absolute, lies under the main checkout's artifacts/
   and does not exist yet (every run writes to a fresh directory).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout.strip()


def fail(message: str) -> None:
    print(f"PREFLIGHT FAIL: {message}")
    sys.exit(1)


def check_linked_worktree() -> tuple[Path, Path]:
    worktree = Path(git("rev-parse", "--show-toplevel")).resolve()
    git_dir = Path(git("rev-parse", "--absolute-git-dir")).resolve()
    common_dir = Path(git("rev-parse", "--git-common-dir")).resolve()
    if git_dir == common_dir:
        fail(f"{worktree} is the main checkout; agents work only in their own worktree")
    main_checkout = common_dir.parent
    return worktree, main_checkout


def check_clean_tree() -> None:
    changes = [line for line in git("status", "--porcelain").splitlines()
               if not line.endswith("node_modules") and "node_modules" not in line]
    if changes:
        fail("the worktree has uncommitted changes: " + "; ".join(changes[:5]))


def check_base(base: str) -> str:
    base_sha = git("rev-parse", "--verify", f"{base}^{{commit}}")
    head_sha = git("rev-parse", "HEAD")
    contains_base = subprocess.run(["git", "merge-base", "--is-ancestor", base_sha, head_sha]).returncode == 0
    if contains_base:
        return f"HEAD {head_sha[:7]} contains base {base_sha[:7]}"
    head_is_behind = subprocess.run(["git", "merge-base", "--is-ancestor", head_sha, base_sha]).returncode == 0
    if not head_is_behind:
        fail(f"HEAD {head_sha[:7]} and base {base_sha[:7]} have diverged; report this instead of merging")
    git("merge", "--ff-only", base_sha)
    return f"fast-forwarded HEAD {head_sha[:7]} to base {base_sha[:7]}"


def check_package_import(worktree: Path, main_checkout: Path) -> str:
    python = main_checkout / ".venv/bin/python"
    environment = dict(os.environ, PYTHONPATH=str(worktree / "packages/ml/src"))
    result = subprocess.run([str(python), "-c", "import silentwatt_ml; print(silentwatt_ml.__file__)"],
                            capture_output=True, text=True, env=environment)
    if result.returncode != 0:
        fail("silentwatt_ml does not import: " + result.stderr.strip()[-300:])
    imported_from = Path(result.stdout.strip()).resolve()
    if not imported_from.is_relative_to(worktree):
        fail(f"silentwatt_ml imports from {imported_from}, not from this worktree")
    return str(python)


def check_data_dir(worktree: Path) -> str:
    data_dir = os.environ.get("SILENTWATT_DATA_DIR")
    if not data_dir:
        fail("SILENTWATT_DATA_DIR is not set; use the absolute path of the dataset folder")
    data_path = Path(data_dir)
    if not data_path.is_absolute() or not data_path.is_dir():
        fail(f"SILENTWATT_DATA_DIR must be an existing absolute directory, got {data_dir}")
    config = json.loads((worktree / "configs/ml/austin-2018.json").read_text(encoding="utf-8"))
    missing = [name for name in config["files"].values() if not (data_path / name).is_file()]
    if missing:
        fail(f"source files missing in {data_path}: {', '.join(missing)}")
    return str(data_path)


def check_artifacts_dir(artifacts_dir: str | None, main_checkout: Path) -> str:
    if artifacts_dir is None:
        return "no artifacts directory for this task"
    path = Path(artifacts_dir)
    if not path.is_absolute():
        fail("the artifacts directory must be an absolute path under the main checkout's artifacts/")
    if not path.resolve().is_relative_to((main_checkout / "artifacts").resolve()):
        fail(f"{path} is not under {main_checkout / 'artifacts'}")
    if path.exists() and any(path.iterdir()):
        fail(f"{path} already holds files; every run writes to a fresh directory")
    return str(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", required=True, help="commit the task starts from")
    parser.add_argument("--artifacts-dir", help="fresh absolute directory for this task's outputs")
    args = parser.parse_args()

    worktree, main_checkout = check_linked_worktree()
    check_clean_tree()
    base_note = check_base(args.base)
    python = check_package_import(worktree, main_checkout)
    data_dir = check_data_dir(worktree)
    artifacts_note = check_artifacts_dir(args.artifacts_dir, main_checkout)

    print("PREFLIGHT OK")
    print(f"  worktree:   {worktree}")
    print(f"  base:       {base_note}")
    print(f"  data:       {data_dir}")
    print(f"  artifacts:  {artifacts_note}")
    print("  use in every command:")
    print(f"    export PYTHONPATH={worktree / 'packages/ml/src'}")
    print(f"    export SILENTWATT_DATA_DIR={data_dir}")
    print(f"    PY={python}")


if __name__ == "__main__":
    main()
