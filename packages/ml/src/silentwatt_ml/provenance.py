from __future__ import annotations

import hashlib
import json
import platform
from importlib.metadata import version
from pathlib import Path

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.data.readers import sha256_file


def provenance(config: ProjectConfig, sources: dict[str, Path]) -> dict:
    package = Path(__file__).parent
    code = hashlib.sha256()
    for path in sorted(package.rglob("*.py")):
        code.update(path.relative_to(package).as_posix().encode())
        code.update(path.read_bytes())
    return {
        "config": config.raw,
        "config_sha256": hashlib.sha256(json.dumps(config.raw, sort_keys=True, allow_nan=False).encode()).hexdigest(),
        "source_sha256": {name: sha256_file(path) for name, path in sources.items()},
        "package_source_sha256": code.hexdigest(),
        "runtime": {"python": platform.python_version(), **{name: version(name) for name in ("numpy", "pandas", "tzdata")}},
    }
