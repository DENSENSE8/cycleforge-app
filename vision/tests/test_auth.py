"""Authentication policy tests without FastAPI/model dependencies."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.auth import vision_token_matches  # noqa: E402


class VisionTokenAuthTests(unittest.TestCase):
    def test_accepts_exact_token_only(self):
        expected = "expected-vision-token-000000000000"
        self.assertTrue(vision_token_matches(expected, expected))
        self.assertFalse(vision_token_matches(None, expected))
        self.assertFalse(vision_token_matches("wrong-token", expected))


if __name__ == "__main__":
    unittest.main(verbosity=2)
