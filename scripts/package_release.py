from __future__ import annotations

import argparse
from pathlib import Path
import zipfile


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "s9h-youtube-cookie-bridge-release.zip"

INCLUDE_PATHS = (
    "install_bridge.cmd",
    "verify_bridge.cmd",
    "uninstall_bridge.cmd",
    "README.md",
    "LICENSE",
    ".gitignore",
    "extension",
    "native-host/cookie_bridge_host.py",
    "native-host/install_native_host.ps1",
    "native-host/uninstall_native_host.ps1",
    "native-host/verify_native_host.ps1",
    "native-host/build_native_host.cmd",
    "native-host/build_native_host.ps1",
    "native-host/dist/cookie_bridge_host.exe",
    "data/runtime/.gitkeep",
)

EXCLUDE_PARTS = {
    ".git",
    "__pycache__",
    "build",
}

EXCLUDE_NAMES = {
    "youtube_cookies.txt",
    "bridge_diagnostics.log",
    ".env",
}

EXCLUDE_SUFFIXES = {
    ".pyc",
    ".log",
    ".zip",
}


def should_exclude(path: Path) -> bool:
    relative = path.relative_to(REPO_ROOT)
    parts = set(relative.parts)
    name = path.name.lower()

    if relative.as_posix() == "native-host/dist/cookie_bridge_host.exe":
        return False
    if parts & EXCLUDE_PARTS:
        return True
    if name in EXCLUDE_NAMES:
        return True
    if name.endswith("cookies.txt") or "cookies" in name and name.endswith(".txt"):
        return True
    if path.suffix.lower() in EXCLUDE_SUFFIXES:
        return True
    return False


def iter_files() -> list[Path]:
    files: list[Path] = []
    for include in INCLUDE_PATHS:
        path = REPO_ROOT / include
        if path.is_dir():
            files.extend(item for item in path.rglob("*") if item.is_file())
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Required release file missing: {include}")

    unique = sorted({path.resolve() for path in files})
    return [path for path in unique if not should_exclude(path)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Package the release-mode S9H YouTube Cookie Bridge zip.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    output = args.output
    if not output.is_absolute():
        output = REPO_ROOT / output

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in iter_files():
            archive.write(path, path.relative_to(REPO_ROOT).as_posix())

    print(f"release_zip={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
