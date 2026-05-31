#!/usr/bin/env python3
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ENDPOINT_FILE = Path("/tmp/playwright-mcp-cdp-endpoint.txt")


def find_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_cdp(port: int, chrome_proc: subprocess.Popen[str], stderr_log: Path, timeout_s: float = 20.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if chrome_proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=0.2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.1)
    if stderr_log.exists():
        sys.stderr.write(stderr_log.read_text(errors="replace"))
    raise RuntimeError("Chrome CDP endpoint did not become ready")


def main() -> int:
    if not Path(DEFAULT_CHROME).exists():
        raise FileNotFoundError(DEFAULT_CHROME)

    user_data_dir = os.environ.get("PLAYWRIGHT_MCP_USER_DATA_DIR") or tempfile.mkdtemp(
        prefix="playwright-mcp-user-data.", dir="/tmp"
    )
    Path(user_data_dir).mkdir(parents=True, exist_ok=True)
    cleanup_user_data_dir = None if os.environ.get("PLAYWRIGHT_MCP_USER_DATA_DIR") else user_data_dir
    log_dir = tempfile.mkdtemp(prefix="playwright-mcp-chrome-log.", dir="/tmp")
    stdout_path = Path(log_dir) / "stdout.log"
    stderr_path = Path(log_dir) / "stderr.log"
    port = find_free_port()
    with open(stdout_path, "w") as stdout, open(stderr_path, "w") as stderr:
        chrome_proc = subprocess.Popen(
            [
                DEFAULT_CHROME,
                "--headless=new",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={user_data_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "about:blank",
            ],
            stdout=stdout,
            stderr=stderr,
            env=os.environ.copy(),
            text=True,
        )

    def cleanup(*_args: object) -> None:
        ENDPOINT_FILE.unlink(missing_ok=True)
        if chrome_proc.poll() is None:
            chrome_proc.terminate()
            try:
                chrome_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome_proc.kill()
        shutil.rmtree(log_dir, ignore_errors=True)
        if cleanup_user_data_dir:
            shutil.rmtree(cleanup_user_data_dir, ignore_errors=True)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    wait_for_cdp(port, chrome_proc, stderr_path)
    ENDPOINT_FILE.write_text(f"http://127.0.0.1:{port}")
    return chrome_proc.wait()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        ENDPOINT_FILE.unlink(missing_ok=True)
