"""Fail-closed configuration checks for the local vision service."""

import os
import sys
import unittest

from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("VISION_TOKEN", "test-only-vision-token-0000000000")

from app.config import Settings  # noqa: E402


class VisionTokenConfigTests(unittest.TestCase):
    def test_rejects_missing_token(self):
        token = os.environ.pop("VISION_TOKEN")
        try:
            with self.assertRaises(ValidationError):
                Settings(_env_file=None)
        finally:
            os.environ["VISION_TOKEN"] = token

    def test_rejects_short_token(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, vision_token="too-short")

    def test_accepts_scoped_strong_token(self):
        configured = Settings(_env_file=None, vision_token="v" * 32)
        self.assertEqual(configured.vision_token, "v" * 32)


if __name__ == "__main__":
    unittest.main(verbosity=2)
