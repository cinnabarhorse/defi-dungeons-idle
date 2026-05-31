#!/usr/bin/env python3
import os
import signal
import subprocess
import sys
import urllib.request
from pathlib import Path


DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HELP_FLAGS = {"-h", "--help", "-V", "--version"}
CDP_ENDPOINT_FILE = Path("/tmp/playwright-mcp-cdp-endpoint.txt")


def build_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("npm_config_cache", "/tmp/codex-npm-cache")
    env.setdefault("npm_config_loglevel", "silent")
    env.setdefault("npm_config_update_notifier", "false")
    env.setdefault("NO_UPDATE_NOTIFIER", "1")
    env.setdefault("XDG_CACHE_HOME", "/tmp/playwright-cache")
    env.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/tmp/ms-playwright")
    Path(env["npm_config_cache"]).mkdir(parents=True, exist_ok=True)
    Path(env["XDG_CACHE_HOME"]).mkdir(parents=True, exist_ok=True)
    Path(env["PLAYWRIGHT_BROWSERS_PATH"]).mkdir(parents=True, exist_ok=True)
    return env


def cdp_endpoint_is_ready(endpoint: str) -> bool:
    try:
        with urllib.request.urlopen(f"{endpoint}/json/version", timeout=0.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def maybe_read_cdp_endpoint_file() -> str | None:
    if not CDP_ENDPOINT_FILE.exists():
        return None
    endpoint = CDP_ENDPOINT_FILE.read_text().strip()
    if endpoint and cdp_endpoint_is_ready(endpoint):
        return endpoint
    return None


def require_cdp_endpoint() -> str:
    endpoint = maybe_read_cdp_endpoint_file()
    if endpoint:
        return endpoint
    raise RuntimeError(
        "Playwright CDP daemon is not running. Start it with: python3 scripts/playwright_cdp_daemon.py"
    )


def main() -> int:
    args = sys.argv[1:]
    env = build_env()
    mcp_proc: subprocess.Popen[str] | None = None

    try:
        if any(arg in HELP_FLAGS for arg in args):
            mcp_args = ["npx", "-y", "@playwright/mcp@latest", *args]
        else:
            mcp_args = ["npx", "-y", "@playwright/mcp@latest"]
            if not env.get("PLAYWRIGHT_MCP_CDP_ENDPOINT"):
                env["PLAYWRIGHT_MCP_CDP_ENDPOINT"] = require_cdp_endpoint()
            if env.get("PLAYWRIGHT_MCP_CDP_ENDPOINT"):
                mcp_args.extend(["--cdp-endpoint", env["PLAYWRIGHT_MCP_CDP_ENDPOINT"]])
            else:
                mcp_args.append("--headless")
                browser = env.get("PLAYWRIGHT_MCP_BROWSER")
                executable_path = env.get("PLAYWRIGHT_MCP_EXECUTABLE_PATH")
                if not browser and Path(DEFAULT_CHROME).exists():
                    mcp_args.extend(["--browser", "chrome", "--executable-path", DEFAULT_CHROME])
                elif browser:
                    mcp_args.extend(["--browser", browser])
                if executable_path:
                    mcp_args.extend(["--executable-path", executable_path])
            mcp_args.extend(args)

        mcp_proc = subprocess.Popen(mcp_args, env=env, text=True)

        def forward_signal(signum: int, _frame: object) -> None:
            if mcp_proc and mcp_proc.poll() is None:
                mcp_proc.send_signal(signum)

        signal.signal(signal.SIGINT, forward_signal)
        signal.signal(signal.SIGTERM, forward_signal)

        return mcp_proc.wait()
    finally:
        if mcp_proc and mcp_proc.poll() is None:
            mcp_proc.terminate()
            try:
                mcp_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                mcp_proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
