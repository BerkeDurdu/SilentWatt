from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from silentwatt_ml.config import load_config


class ConfigTests(unittest.TestCase):
    def test_missing_required_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(json.dumps({"dataset_id": "demo"}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing required keys"):
                load_config(path)


if __name__ == "__main__":
    unittest.main()

