#!/usr/bin/env python3
"""Native Messaging host for S9H YouTube Cookie Bridge."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import struct
import sys
import tempfile
from typing import Any


HOST_NAME = "com.s9h.youtube_downloader.cookies"
SOURCE_NAME = "s9h-youtube-cookie-bridge"
VERSION = 1
MAX_MESSAGE_BYTES = 32 * 1024 * 1024


def runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


RUNTIME_DIR = runtime_dir()
HOST_DIR = RUNTIME_DIR.parent if RUNTIME_DIR.name.lower() == "dist" else RUNTIME_DIR
PROJECT_ROOT = HOST_DIR.parent
CONFIG_PATH = HOST_DIR / "config.json"
DEFAULT_OUTPUT_COOKIE_FILE = PROJECT_ROOT / "data" / "runtime" / "youtube_cookies.txt"
DIAGNOSTICS_LOG_PATH = PROJECT_ROOT / "data" / "runtime" / "bridge_diagnostics.log"

ALLOWED_COOKIE_DOMAINS = (
    ".youtube.com",
    "youtube.com",
    "www.youtube.com",
    "music.youtube.com",
    ".youtube-nocookie.com",
    "youtube-nocookie.com",
    ".google.com",
    "google.com",
    ".googlevideo.com",
    "googlevideo.com",
)

ALLOWED_COOKIE_ROOTS = (
    "youtube.com",
    "youtube-nocookie.com",
    "google.com",
    "googlevideo.com",
)


class HostError(Exception):
    """Expected request or validation error safe to send to the extension."""


def stderr_log(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def file_metadata(path: Path) -> dict[str, Any]:
    try:
        stat = path.stat()
        if not path.is_file():
            raise OSError
        return {
            "exists": True,
            "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
            "mtime": datetime.fromtimestamp(stat.st_mtime_ns / 1_000_000_000, timezone.utc).isoformat(),
        }
    except OSError:
        return {
            "exists": False,
            "size": 0,
            "mtime_ns": None,
            "mtime": None,
        }


def append_diagnostic(
    event: str,
    action: str,
    output_path: Path | None,
    *,
    success: bool,
    error_code: str = "",
    error: str = "",
    bytes_written: int | None = None,
) -> None:
    metadata = file_metadata(output_path) if output_path is not None else file_metadata(Path(""))
    record = {
        "tag": "BRIDGE-DIAG",
        "timestamp": utc_now_iso(),
        "event": event,
        "action": action,
        "output_cookie_path": str(output_path) if output_path is not None else "",
        "exists_after_write": metadata["exists"],
        "bytes_written": 0 if bytes_written is None else bytes_written,
        "size": metadata["size"],
        "mtime_ns": metadata["mtime_ns"],
        "mtime": metadata["mtime"],
        "success": success,
        "error_code": error_code,
        "error": error,
    }

    try:
        DIAGNOSTICS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with DIAGNOSTICS_LOG_PATH.open("a", encoding="utf-8", newline="\n") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    except OSError:
        pass


def export_action_from_message(message: dict[str, Any]) -> str:
    action = str(message.get("export_action") or "").strip()
    if action in {"manual_export", "auto_export"}:
        return action
    return "unknown_export"


def read_exact(length: int) -> bytes:
    data = sys.stdin.buffer.read(length)
    if len(data) != length:
        raise HostError("Incomplete native messaging payload.")
    return data


def read_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if raw_length == b"":
        return None
    if len(raw_length) != 4:
        raise HostError("Invalid native messaging frame.")

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length <= 0:
        raise HostError("Native messaging payload is empty.")
    if message_length > MAX_MESSAGE_BYTES:
        raise HostError("Native messaging payload is too large.")

    payload = read_exact(message_length)
    try:
        message = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HostError("Native messaging payload is not valid JSON.") from exc

    if not isinstance(message, dict):
        raise HostError("Native messaging payload must be a JSON object.")
    return message


def write_message(message: dict[str, Any]) -> None:
    payload = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def clean_cookie_domain(domain: Any) -> str:
    value = str(domain or "").strip().lower()
    if value.startswith("#httponly_"):
        value = value[len("#httponly_") :]
    value = value.rstrip(".")
    while value.startswith("."):
        value = value[1:]
    return value


def is_allowed_cookie_domain(domain: Any) -> bool:
    clean = clean_cookie_domain(domain)
    if not clean:
        return False
    return any(clean == root or clean.endswith("." + root) for root in ALLOWED_COOKIE_ROOTS)


def bool_text(flag: Any) -> str:
    return "TRUE" if bool(flag) else "FALSE"


def cookie_expiration(cookie: dict[str, Any]) -> str:
    expiration = cookie.get("expirationDate")
    if expiration is None:
        return "0"

    try:
        value = float(expiration)
    except (TypeError, ValueError):
        return "0"

    if not math.isfinite(value) or value <= 0:
        return "0"
    return str(int(value))


def text_field(item: Any) -> str:
    return str(item if item is not None else "").replace("\r", "").replace("\n", "")


def normalize_cookie(cookie: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(cookie, dict):
        raise HostError(f"Invalid cookie record at index {index}.")

    for field in ("domain", "path", "name", "value"):
        if field not in cookie:
            raise HostError(f"Cookie record at index {index} is missing a required field.")

    if not is_allowed_cookie_domain(cookie.get("domain")):
        return None

    name = text_field(cookie.get("name"))
    if not name:
        return None

    value = cookie.get("value")
    if value is None:
        return None

    domain = text_field(cookie.get("domain")).strip().lower()
    path = text_field(cookie.get("path")).strip() or "/"
    if not path.startswith("/"):
        path = "/" + path

    raw_host_only = cookie.get("hostOnly")
    if isinstance(raw_host_only, bool):
        host_only = raw_host_only
    else:
        host_only = not domain.startswith(".")

    return {
        "domain": domain,
        "hostOnly": host_only,
        "path": path,
        "secure": bool(cookie.get("secure")),
        "httpOnly": bool(cookie.get("httpOnly")),
        "expirationDate": cookie.get("expirationDate"),
        "name": name,
        "value": text_field(value),
    }


def normalize_cookies(cookies: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, cookie in enumerate(cookies):
        item = normalize_cookie(cookie, index)
        if item is not None:
            normalized.append(item)
    return normalized


def dedupe_cookies(cookies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[tuple[str, str, str], dict[str, Any]] = {}

    for cookie in cookies:
        domain = clean_cookie_domain(cookie.get("domain"))
        path = text_field(cookie.get("path")).strip() or "/"
        name = text_field(cookie.get("name"))
        if not domain or not name:
            continue
        by_key[(domain, path, name)] = cookie

    return [by_key[key] for key in sorted(by_key)]


def sort_cookie_key(cookie: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(cookie.get("domain") or ""),
        str(cookie.get("path") or ""),
        str(cookie.get("name") or ""),
    )


def format_netscape(cookies: list[dict[str, Any]]) -> str:
    lines = [
        "# Netscape HTTP Cookie File",
        "# This file was generated by S9H YouTube Cookie Bridge.",
        "# Do not share this file.",
    ]

    for cookie in sorted(cookies, key=sort_cookie_key):
        domain = text_field(cookie.get("domain")).strip().lower()
        include_subdomains = (not cookie.get("hostOnly")) or domain.startswith(".")
        output_domain = "#HttpOnly_" + domain if cookie.get("httpOnly") else domain
        lines.append(
            "\t".join(
                [
                    output_domain,
                    bool_text(include_subdomains),
                    text_field(cookie.get("path")) or "/",
                    bool_text(cookie.get("secure")),
                    cookie_expiration(cookie),
                    text_field(cookie.get("name")),
                    text_field(cookie.get("value")),
                ]
            )
        )

    return "\n".join(lines) + "\n"


def load_output_cookie_file() -> Path:
    if not CONFIG_PATH.exists():
        return DEFAULT_OUTPUT_COOKIE_FILE.resolve()

    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HostError("Native host config.json is not valid.") from exc

    if not isinstance(config, dict):
        raise HostError("Native host config.json must contain a JSON object.")

    configured = config.get("output_cookie_file")
    if not configured:
        return DEFAULT_OUTPUT_COOKIE_FILE.resolve()

    configured_path = Path(str(configured))
    if configured_path.is_absolute():
        return configured_path
    return (HOST_DIR / configured_path).resolve()


def write_text_atomically(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=str(target.parent),
            prefix="." + target.name + ".",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_name = temp_file.name
            temp_file.write(content)
            temp_file.flush()
            os.fsync(temp_file.fileno())

        os.replace(temp_name, target)
    finally:
        if temp_name and os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except OSError:
                pass


def handle_ping(message: dict[str, Any]) -> dict[str, Any]:
    if message.get("version") != VERSION:
        raise HostError("Unsupported message version.")

    return {
        "ok": True,
        "type": "pong",
        "host": HOST_NAME,
        "version": VERSION,
    }


def handle_export(message: dict[str, Any]) -> dict[str, Any]:
    if message.get("version") != VERSION:
        raise HostError("Unsupported message version.")
    if message.get("source") != SOURCE_NAME:
        raise HostError("Unsupported message source.")

    action = export_action_from_message(message)
    cookies = message.get("cookies")
    if not isinstance(cookies, list):
        append_diagnostic(
            "export_failed",
            action,
            None,
            success=False,
            error_code="invalid_cookies_payload",
            error="Export message cookies field must be a list.",
        )
        raise HostError("Export message cookies field must be a list.")

    try:
        output_path = load_output_cookie_file()
    except HostError as exc:
        append_diagnostic(
            "export_failed",
            action,
            None,
            success=False,
            error_code="output_path_unavailable",
            error=str(exc),
        )
        raise

    try:
        normalized = dedupe_cookies(normalize_cookies(cookies))
        write_text_atomically(output_path, format_netscape(normalized))
    except HostError as exc:
        append_diagnostic(
            "export_failed",
            action,
            output_path,
            success=False,
            error_code="export_validation_failed",
            error=str(exc),
        )
        raise
    except OSError as exc:
        append_diagnostic(
            "export_failed",
            action,
            output_path,
            success=False,
            error_code="cookie_file_write_failed",
            error=str(exc),
        )
        raise HostError("Could not write cookie file.") from exc

    metadata = file_metadata(output_path)
    append_diagnostic(
        "export_success",
        action,
        output_path,
        success=True,
        bytes_written=metadata["size"],
    )
    updated_at = utc_now_iso()

    return {
        "ok": True,
        "type": "export_result",
        "cookie_count": len(normalized),
        "written_to": str(output_path),
        "updated_at": updated_at,
    }


def handle_cookie_file_status(message: dict[str, Any]) -> dict[str, Any]:
    if message.get("version") != VERSION:
        raise HostError("Unsupported message version.")
    if message.get("source") != SOURCE_NAME:
        raise HostError("Unsupported message source.")

    try:
        output_path = load_output_cookie_file()
    except HostError as exc:
        append_diagnostic(
            "status_failed",
            "getCookieFileStatus",
            None,
            success=False,
            error_code="output_path_unavailable",
            error=str(exc),
        )
        raise

    append_diagnostic(
        "status_checked",
        "getCookieFileStatus",
        output_path,
        success=True,
    )
    metadata = file_metadata(output_path)
    return {
        "ok": True,
        "type": "cookie_file_status",
        "exists": metadata["exists"],
        "size": metadata["size"],
        "mtime": metadata["mtime"],
        "mtime_ns": metadata["mtime_ns"],
        "path": str(output_path),
    }


def handle_open_cookie_file_location(message: dict[str, Any]) -> dict[str, Any]:
    if message.get("version") != VERSION:
        raise HostError("Unsupported message version.")
    if message.get("source") != SOURCE_NAME:
        raise HostError("Unsupported message source.")

    try:
        output_path = load_output_cookie_file()
    except HostError as exc:
        append_diagnostic(
            "open_location_failed",
            "openCookieFileLocation",
            None,
            success=False,
            error_code="output_path_unavailable",
            error=str(exc),
        )
        raise

    if not output_path.is_file():
        opened_folder = False
        runtime_folder = output_path.parent
        try:
            if os.name == "nt" and runtime_folder.exists() and runtime_folder.resolve() == (PROJECT_ROOT / "data" / "runtime").resolve():
                subprocess.Popen(["explorer.exe", str(runtime_folder)])
                opened_folder = True
        except OSError:
            opened_folder = False

        append_diagnostic(
            "open_location_failed",
            "openCookieFileLocation",
            output_path,
            success=False,
            error_code="cookie_file_missing",
            error="Cookie file not found.",
        )
        return {
            "ok": False,
            "type": "open_cookie_file_location_result",
            "error": "Cookie file not found.",
            "error_code": "cookie_file_missing",
            "opened_folder": opened_folder,
        }

    if os.name != "nt":
        append_diagnostic(
            "open_location_failed",
            "openCookieFileLocation",
            output_path,
            success=False,
            error_code="open_location_unsupported",
            error="Opening cookie file location is only supported on Windows.",
        )
        return {
            "ok": False,
            "type": "open_cookie_file_location_result",
            "error": "Opening cookie file location is only supported on Windows.",
            "error_code": "open_location_unsupported",
        }

    try:
        subprocess.Popen(["explorer.exe", f"/select,{output_path}"])
    except OSError as exc:
        append_diagnostic(
            "open_location_failed",
            "openCookieFileLocation",
            output_path,
            success=False,
            error_code="open_location_failed",
            error="Could not open cookie file location.",
        )
        raise HostError("Could not open cookie file location.") from exc

    append_diagnostic(
        "open_location_success",
        "openCookieFileLocation",
        output_path,
        success=True,
    )
    return {
        "ok": True,
        "type": "open_cookie_file_location_result",
    }


def handle_message(message: dict[str, Any]) -> dict[str, Any]:
    message_type = message.get("type")
    if message_type == "ping":
        return handle_ping(message)
    if message_type == "export_youtube_cookies":
        return handle_export(message)
    if message_type == "getCookieFileStatus":
        return handle_cookie_file_status(message)
    if message_type == "openCookieFileLocation":
        return handle_open_cookie_file_location(message)
    raise HostError("Unsupported message type.")


def main() -> int:
    while True:
        try:
            message = read_message()
            if message is None:
                return 0

            response = handle_message(message)
        except HostError as exc:
            response = {
                "ok": False,
                "error": str(exc),
            }
        except Exception:
            stderr_log("Unexpected native host failure.")
            response = {
                "ok": False,
                "error": "Native host failed unexpectedly.",
            }

        write_message(response)


if __name__ == "__main__":
    raise SystemExit(main())
