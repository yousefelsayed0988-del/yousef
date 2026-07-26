#!/usr/bin/env python3
"""
Orebound proxy -- a Flask front end for the game on port 3000.

    python3 proxy.py                 # http://localhost:3000
    python3 proxy.py --tunnel        # ...and a public https:// link via Cloudflare
    python3 proxy.py --port 8080     # somewhere else

Why this exists alongside serve.mjs: a Flask app is easy to put behind a tunnel,
a reverse proxy, or a platform that expects a Python entry point. This file is
that entry point.

Two jobs:

  1. Serve the game. Static files out of this directory, with the one detail
     that actually matters -- `.js` and `.mjs` must come back as
     `text/javascript`. The game is vanilla ES modules with module workers; a
     wrong MIME type makes the browser refuse the script and the loading screen
     hangs forever with no error in the console.

  2. Proxy online play. The multiplayer authority lives in the Node server
     (mpserver.mjs), so `/net` is relayed frame-for-frame to it and the browser
     never knows the difference. The client builds its socket URL from
     `location`, so through an https tunnel it asks for `wss://.../net` and
     lands here. If Node is not installed the game still runs single-player;
     only the Online button stops working.

Needs: pip install flask flask-sock simple-websocket
"""

import argparse
import atexit
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time

from flask import Flask, Response, send_from_directory
from flask_sock import Sock

try:
    from simple_websocket import Client as WSClient
except ImportError:                                    # pragma: no cover
    WSClient = None

ROOT = os.path.dirname(os.path.abspath(__file__))

# Browsers reject a module served as anything but a JavaScript MIME type, and
# the mapping for .mjs is missing on plenty of systems. Pin both.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")

app = Flask(__name__, static_folder=None)
sock = Sock(app)
app.config["SOCK_SERVER_OPTIONS"] = {"ping_interval": 25}

BACKEND = {"host": "127.0.0.1", "port": 8123, "proc": None, "online": True}


# --------------------------------------------------------------------- static
@app.route("/")
def index():
    return _serve("index.html")


@app.route("/<path:path>")
def asset(path):
    return _serve(path)


def _serve(path):
    full = os.path.normpath(os.path.join(ROOT, path))
    if not full.startswith(ROOT) or not os.path.isfile(full):
        return Response("not found\n", status=404, mimetype="text/plain")
    rel = os.path.relpath(full, ROOT)
    resp = send_from_directory(ROOT, rel)
    # The game is edited and reloaded constantly; a cached worker script that no
    # longer matches its module graph is a miserable thing to debug.
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/healthz")
def healthz():
    return {"ok": True, "online": BACKEND["online"] and backend_up()}


# ------------------------------------------------------------------ multiplayer
@sock.route("/net")
def net(ws):
    """Relay this browser's multiplayer socket to the Node authority."""
    if WSClient is None or not BACKEND["online"]:
        _refuse(ws, "online play is disabled on this host")
        return
    url = f"ws://{BACKEND['host']}:{BACKEND['port']}/net"
    try:
        upstream = WSClient.connect(url)
    except Exception as exc:
        _refuse(ws, f"multiplayer backend unavailable ({exc})")
        return

    stop = threading.Event()

    def downstream():
        # backend -> browser
        try:
            while not stop.is_set():
                data = upstream.receive(timeout=1)
                if data is None:
                    continue
                ws.send(data)
        except Exception:
            pass
        finally:
            stop.set()

    pump = threading.Thread(target=downstream, daemon=True)
    pump.start()
    try:
        while not stop.is_set():
            data = ws.receive(timeout=1)
            if data is None:
                continue
            upstream.send(data)
    except Exception:
        pass
    finally:
        stop.set()
        try:
            upstream.close()
        except Exception:
            pass


def _refuse(ws, why):
    # The client shows whatever text arrives here on its connect screen.
    try:
        ws.send(json.dumps({"t": "error", "message": why}))
    except Exception:
        pass


# ---------------------------------------------------------------- node backend
def backend_up(host=None, port=None, timeout=0.4):
    host = host or BACKEND["host"]
    port = port or BACKEND["port"]
    with socket.socket() as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


def start_backend(port, log_path):
    """Start the Node host that owns the shared world, if one is not already up."""
    if backend_up(port=port):
        print(f"  online play: using the Node host already on :{port}")
        return None
    if not shutil.which("node"):
        print("  online play: disabled (node is not installed)")
        BACKEND["online"] = False
        return None
    log = open(log_path, "w")
    proc = subprocess.Popen(
        ["node", "serve.mjs", "--port", str(port)],
        cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        if proc.poll() is not None:
            print(f"  online play: the Node host exited, see {log_path}")
            BACKEND["online"] = False
            return None
        if backend_up(port=port):
            print(f"  online play: Node host started on :{port}")
            return proc
        time.sleep(0.25)
    print(f"  online play: the Node host did not come up, see {log_path}")
    BACKEND["online"] = False
    return proc


def stop_backend():
    proc = BACKEND.get("proc")
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


# -------------------------------------------------------------------- tunnel
TUNNEL_RE = re.compile(rb"https://[-a-z0-9]+\.trycloudflare\.com")


def start_tunnel(port, log_path, wait=40):
    """Run a Cloudflare quick tunnel and return its public URL."""
    exe = shutil.which("cloudflared")
    if not exe:
        print("  tunnel: cloudflared is not installed.")
        print("          macOS:   brew install cloudflared")
        print("          Windows: winget install --id Cloudflare.cloudflared")
        print("          Linux:   https://github.com/cloudflare/cloudflared/releases"
              " (cloudflared-linux-amd64)")
        return None, None
    log = open(log_path, "wb")
    proc = subprocess.Popen(
        [exe, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{port}"],
        stdout=log, stderr=subprocess.STDOUT,
    )
    deadline = time.time() + wait
    while True:
        try:
            with open(log_path, "rb") as fh:
                text = fh.read()
        except FileNotFoundError:
            text = b""
        m = TUNNEL_RE.search(text)
        if m:
            return proc, m.group(0).decode()
        exited = proc.poll() is not None
        if exited or time.time() >= deadline:
            _explain_tunnel_failure(text, log_path, wait, exited)
            return proc, None
        time.sleep(0.5)


def _explain_tunnel_failure(text, log_path, wait, exited):
    blob = text.decode("utf-8", "replace")
    if "not in allowlist" in blob or "403 Forbidden" in blob:
        print("  tunnel: blocked -- this network does not allow "
              "api.trycloudflare.com.")
        print("          The game is still served locally on the port above.")
    elif exited:
        print(f"  tunnel: cloudflared exited early, see {log_path}")
    else:
        print(f"  tunnel: no URL after {wait}s, see {log_path}")


def lan_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return None


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Serve Orebound over Flask.")
    ap.add_argument("--port", type=int, default=3000, help="HTTP port (default 3000)")
    ap.add_argument("--host", default="0.0.0.0", help="bind address (default 0.0.0.0)")
    ap.add_argument("--backend-port", type=int, default=8123,
                    help="port of the Node multiplayer host (default 8123)")
    ap.add_argument("--no-online", action="store_true",
                    help="serve the game only; do not start or proxy the Node host")
    ap.add_argument("--tunnel", action="store_true",
                    help="also expose a public https link with cloudflared")
    ap.add_argument("--debug", action="store_true", help="Flask reloader + tracebacks")
    args = ap.parse_args()

    BACKEND["port"] = args.backend_port
    BACKEND["online"] = not args.no_online

    print()
    print(f"  Orebound is running at http://localhost:{args.port}/")
    ip = lan_address()
    if ip and args.host in ("0.0.0.0", "::"):
        print(f"  On your network:      http://{ip}:{args.port}/")

    if BACKEND["online"]:
        BACKEND["proc"] = start_backend(args.backend_port,
                                        os.path.join(ROOT, "node-host.log"))
        atexit.register(stop_backend)

    if args.tunnel:
        proc, url = start_tunnel(args.port, os.path.join(ROOT, "tunnel.log"))
        if proc:
            atexit.register(lambda: proc.poll() is None and proc.terminate())
        if url:
            print()
            print(f"  Public link:          {url}")
            print("  Anyone with that link can play -- it dies when this stops.")

    print()
    print("  Leave this window open while you play. Press Ctrl+C to stop.")
    print()

    # threaded: every WebSocket relay holds a thread for as long as it is open.
    app.run(host=args.host, port=args.port, threaded=True,
            debug=args.debug, use_reloader=args.debug)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  stopped.")
        sys.exit(0)
