#!/usr/bin/env python3
"""Cron-wrapper: weekly-market-content-signals (hermes cron --script tager ingen argumenter)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ekstern_radar  # noqa: E402

sys.exit(ekstern_radar.main(["--topic", "marked"]))
