#!/usr/bin/env python3
"""Offline: blog_moenster.py + blog_ide_oprydning.py (fakes for HQ/Jev/DeepSeek — ingen net)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blog_ide_oprydning  # noqa: E402
import blog_moenster  # noqa: E402


class BlogOpfoelgning(unittest.TestCase):
    def test_moenster(self):
        blog_moenster._selftest()

    def test_ide_oprydning(self):
        blog_ide_oprydning._selftest()


if __name__ == "__main__":
    unittest.main()
