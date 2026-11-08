#!/usr/bin/env python3
"""Serve only the built game in dist/. This is not an API or database server."""

from __future__ import annotations

import argparse
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

DIST = Path(__file__).resolve().parents[1] / "dist"


def make_handler(root: Path):
    """Create a static handler; paths and symlinks must remain inside root."""
    static_root = root.resolve()

    class StaticGameHandler(BaseHTTPRequestHandler):
        server_version = "COM-LAB-RESCUE"
        sys_version = ""

        def _headers(self, status: int, content_type: str, length: int):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

        def _error(self, status: int, message: str, head: bool):
            content = (message + "\n").encode("utf-8")
            self._headers(status, "text/plain; charset=utf-8", len(content))
            if not head:
                self.wfile.write(content)

        def _serve(self, head: bool = False):
            try:
                requested = unquote(urlsplit(self.path).path, errors="strict")
            except (ValueError, UnicodeError):
                return self._error(400, "Invalid request path.", head)
            if "\x00" in requested or "\\" in requested:
                return self._error(400, "Invalid request path.", head)
            parts = requested.split("/")
            if any(part in (".", "..") or part.startswith(".") for part in parts if part):
                return self._error(403, "Only built game files are available.", head)
            relative = requested.lstrip("/") or "index.html"
            try:
                target = (static_root / relative).resolve()
            except (OSError, RuntimeError):
                return self._error(403, "Only built game files are available.", head)
            if target == static_root or static_root not in target.parents:
                return self._error(403, "Only built game files are available.", head)
            if not target.is_file():
                return self._error(404, "Game file not found. Build the project first.", head)
            try:
                data = target.read_bytes()
            except OSError:
                return self._error(404, "Game file is unavailable.", head)
            content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
                content_type += "; charset=utf-8"
            self._headers(200, content_type, len(data))
            if not head:
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def do_GET(self):
            self._serve()

        def do_HEAD(self):
            self._serve(head=True)

        def _method_not_allowed(self):
            self.close_connection = True
            self._error(405, "This server only serves static game files. Online data uses Google Apps Script.", False)

        do_POST = _method_not_allowed
        do_PUT = _method_not_allowed
        do_PATCH = _method_not_allowed
        do_DELETE = _method_not_allowed

        def log_message(self, _format, *_args):
            # Do not log arbitrary query strings or player information.
            return

    return StaticGameHandler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strictPort', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument("--host", default="127.0.0.1", help="Listening address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=os.environ.get("PORT", "3000"), help="Port (default: PORT or 3000)")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (DIST / "index.html").is_file():
        parser.error("dist/index.html is missing. Run npm run build first, or use the supplied built release.")
    server = ThreadingHTTPServer((args.host, args.port), make_handler(DIST))
    server.daemon_threads = True
    address = "localhost" if args.host in ("0.0.0.0", "::") else args.host
    print(f"COM LAB RESCUE — static game preview\nhttp://{address}:{args.port}\nPress Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
