"""
start_with_ngrok.py — Start ngrok, auto-patch PUBLIC_BASE_URL in backend/.env, then start the backend.

Usage:
    python start_with_ngrok.py

Requires ngrok to be installed:
    choco install ngrok          (Windows)
    brew install ngrok           (Mac)
    or download from ngrok.com/download
"""

import os
import re
import sys
import time
import subprocess
import urllib.request
import json

ROOT    = os.path.dirname(os.path.abspath(__file__))
ENV     = os.path.join(ROOT, "backend", ".env")
PORT    = 8000
NGROK_API = "http://localhost:4040/api/tunnels"


def get_ngrok_url(retries=20, delay=0.5) -> str:
    """Poll ngrok's local API until the HTTPS tunnel is up."""
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(NGROK_API, timeout=2) as r:
                data = json.loads(r.read())
            for tunnel in data.get("tunnels", []):
                url = tunnel.get("public_url", "")
                if url.startswith("https://"):
                    return url
        except Exception:
            pass
        time.sleep(delay)
        print(f"  Waiting for ngrok tunnel... ({attempt + 1}/{retries})")
    return ""


def patch_env(url: str) -> None:
    """Write PUBLIC_BASE_URL into backend/.env (update existing line or append)."""
    with open(ENV, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = r"^PUBLIC_BASE_URL=.*$"
    new_line = f"PUBLIC_BASE_URL={url}"

    if re.search(pattern, content, flags=re.MULTILINE):
        content = re.sub(pattern, new_line, content, flags=re.MULTILINE)
    else:
        content = content.rstrip("\n") + f"\n{new_line}\n"

    with open(ENV, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"  backend/.env updated: PUBLIC_BASE_URL={url}")


def get_localtunnel_url(retries=20, delay=0.5) -> tuple:
    """Start localtunnel and return (process, url)."""
    proc = subprocess.Popen(
        ["npx", "localtunnel", "--port", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    for _ in range(retries):
        line = proc.stdout.readline()
        if "your url is:" in line:
            url = line.strip().split("your url is:")[-1].strip()
            return proc, url
        time.sleep(delay)
    return proc, ""


def main():
    print("=" * 55)
    print("  MantaRay AI — tunnel + backend launcher")
    print("=" * 55)

    tunnel_proc = None
    url = ""

    # ── Step 1: Try ngrok, fall back to localtunnel ──────────
    print(f"\n[1/3] Starting tunnel on port {PORT}...")
    try:
        ngrok_proc = subprocess.Popen(
            ["ngrok", "http", str(PORT)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("[1/3] ngrok started — waiting for tunnel...")
        url = get_ngrok_url()
        if url:
            tunnel_proc = ngrok_proc
            print(f"[1/3] ngrok tunnel ready: {url}")
        else:
            print("[1/3] ngrok auth not configured — falling back to localtunnel...")
            ngrok_proc.terminate()
    except FileNotFoundError:
        print("[1/3] ngrok not found — trying localtunnel...")

    if not url:
        tunnel_proc, url = get_localtunnel_url()
        if url:
            print(f"[1/3] localtunnel ready: {url}")
        else:
            print("\n  ERROR: Both ngrok and localtunnel failed to start a tunnel.")
            if tunnel_proc:
                tunnel_proc.terminate()
            sys.exit(1)

    # ── Step 2: Patch .env ───────────────────────────────────
    patch_env(url)

    # ── Step 3: Start the FastAPI backend ────────────────────
    print(f"\n[3/3] Starting FastAPI backend on http://localhost:{PORT} ...")
    print(f"      Twilio webhook URL: {url}/twilio/voice")
    print("=" * 55)
    print("  Press Ctrl+C to stop both ngrok and the backend.")
    print("=" * 55 + "\n")

    backend_dir = os.path.join(ROOT, "backend")
    try:
        backend_proc = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=backend_dir,
        )
        backend_proc.wait()
    except KeyboardInterrupt:
        print("\n\n  Shutting down...")
    finally:
        try:
            backend_proc.terminate()
        except Exception:
            pass
        ngrok_proc.terminate()
        print("  ngrok and backend stopped.")


if __name__ == "__main__":
    main()
