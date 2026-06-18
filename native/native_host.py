#!/usr/bin/env python3
"""Developer compatibility shim for the Cookie Bridge native host.

The canonical native host source is ../native-host/cookie_bridge_host.py.
This shim keeps old development script-mode entry points aligned with the
release implementation without duplicating cookie export logic.
"""

from __future__ import annotations

from pathlib import Path
import runpy
import sys


CANONICAL_HOST = Path(__file__).resolve().parents[1] / "native-host" / "cookie_bridge_host.py"


def main() -> int:
    if not CANONICAL_HOST.is_file():
        sys.stderr.write(f"Canonical native host not found: {CANONICAL_HOST}\n")
        return 1

    runpy.run_path(str(CANONICAL_HOST), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
