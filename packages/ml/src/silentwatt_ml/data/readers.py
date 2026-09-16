from __future__ import annotations

import hashlib
import csv
from pathlib import Path
from typing import Iterator

import pandas as pd


def sha256_file(path: Path, block_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(block_size), b""):
            digest.update(block)
    return digest.hexdigest()


def require_files(data_dir: Path, files: dict[str, str]) -> dict[str, Path]:
    root = data_dir.expanduser().resolve()
    resolved = {name: (root / filename).resolve() for name, filename in files.items()}
    if any(not path.is_relative_to(root) for path in resolved.values()):
        raise ValueError("Dataset path escapes data-dir")
    missing = [str(path) for path in resolved.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Required dataset files are missing: " + ", ".join(missing))
    return resolved


def read_weather(path: Path) -> tuple[dict[str, str], pd.DataFrame]:
    lines = path.read_text(encoding="utf-8").splitlines()
    try:
        table_header_index = next(i for i, line in enumerate(lines) if line.startswith("time,"))
    except StopIteration as exc:
        raise ValueError(f"Weather table header beginning with 'time,' was not found: {path}") from exc

    metadata: dict[str, str] = {}
    if table_header_index >= 2:
        keys = next(csv.reader([lines[0]]))
        values = next(csv.reader([lines[1]]))
        metadata = dict(zip(keys, values, strict=False))

    frame = pd.read_csv(path, skiprows=table_header_index)
    return metadata, frame


def iter_electric(
    path: Path,
    *,
    usecols: list[str],
    chunksize: int = 250_000,
) -> Iterator[pd.DataFrame]:
    yield from pd.read_csv(path, usecols=usecols, chunksize=chunksize)


def read_household_electric(
    path: Path,
    *,
    household_column: str,
    household_id: int,
    usecols: list[str],
    chunksize: int = 250_000,
) -> pd.DataFrame:
    selected: list[pd.DataFrame] = []
    for chunk in iter_electric(path, usecols=usecols, chunksize=chunksize):
        match = chunk[chunk[household_column] == household_id]
        if not match.empty:
            selected.append(match.copy())
    if not selected:
        raise ValueError(f"Household {household_id} was not found in {path.name}")
    return pd.concat(selected, ignore_index=True)
