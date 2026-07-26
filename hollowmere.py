"""HOLLOWMERE - Chapter One: The Lodger
Standalone launcher. Serves the game locally and opens it in an app window.
Pure standard library - no pip installs needed.
"""
import os
import sys
import socket
import threading
import webbrowser
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def base_dir():
    if hasattr(sys, '_MEIPASS'):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


ROOT = base_dir()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
]


def launch(url):
    for exe in BROWSERS:
        if os.path.isfile(exe):
            try:
                subprocess.Popen([
                    exe,
                    '--app=' + url,
                    '--window-size=1600,900',
                    '--autoplay-policy=no-user-gesture-required',
                ])
                return True
            except Exception:
                pass
    return webbrowser.open(url)


def main():
    port = free_port()
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = 'http://127.0.0.1:%d/index.html' % port
    print('HOLLOWMERE running at', url)
    print('Close this window to quit the game.')
    launch(url)
    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
