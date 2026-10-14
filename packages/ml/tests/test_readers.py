from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from silentwatt_ml.data.readers import read_weather


class WeatherReaderTests(unittest.TestCase):
    def test_open_meteo_metadata_and_table_are_separated(self) -> None:
        content = (
            "latitude,longitude,timezone\n"
            "30.2,-97.7,GMT\n"
            "\n"
            "time,temperature_2m (°C)\n"
            "2018-01-01T00:00,2.0\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weather.csv"
            path.write_text(content, encoding="utf-8")
            metadata, frame = read_weather(path)

        self.assertEqual(metadata["timezone"], "GMT")
        self.assertEqual(frame.columns.tolist(), ["time", "temperature_2m (°C)"])
        self.assertEqual(len(frame), 1)


if __name__ == "__main__":
    unittest.main()

