from __future__ import annotations

import unittest

import numpy as np

from silentwatt_ml.models.baseline import pinball_loss


class BaselineTests(unittest.TestCase):
    def test_pinball_loss_is_zero_for_exact_predictions(self) -> None:
        actual = np.array([0.0, 1.0, 2.0])
        self.assertEqual(pinball_loss(actual, actual, 0.5), 0.0)

    def test_pinball_loss_penalizes_underprediction_by_quantile(self) -> None:
        actual = np.array([2.0])
        predicted = np.array([1.0])
        self.assertAlmostEqual(pinball_loss(actual, predicted, 0.95), 0.95)


if __name__ == "__main__":
    unittest.main()

