#!/usr/bin/env python3
"""
Demo server for concept-tree.

Serves the demo frontend and provides a REST API for managing concept
markdown files. Run from the project root:

    python3 demo/server.py

Then open http://localhost:8420 in a browser.
"""

import http.server
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PORT = 8420
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEMO_DIR = PROJECT_ROOT / "demo"
SRC_DIR = PROJECT_ROOT / "src"
CONCEPTS_DIR = DEMO_DIR / "concepts"


class ConceptTreeHandler(http.server.BaseHTTPRequestHandler):
    """Handles static files + concept CRUD API."""

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ── API routes ────────────────────────────────────────────────────
        if path == "/api/concepts":
            self._serve_all_concepts()
            return

        if path.startswith("/api/concept/"):
            concept_id = path[len("/api/concept/"):]
            self._serve_concept(concept_id)
            return

        if path == "/api/tags":
            self._serve_tags()
            return

        # ── Static files ──────────────────────────────────────────────────
        # /src/* → project src directory
        if path.startswith("/src/"):
            self._serve_file(PROJECT_ROOT / path.lstrip("/"))
            return

        # /images/* → demo/images directory
        if path.startswith("/images/"):
            self._serve_file(DEMO_DIR / path.lstrip("/"))
            return

        # Default routes
        if path == "/" or path == "/index.html":
            self._serve_file(DEMO_DIR / "index.html")
            return

        if path == "/detail" or path == "/detail.html":
            self._serve_file(DEMO_DIR / "detail.html")
            return

        # Everything else from demo directory
        file_path = DEMO_DIR / path.lstrip("/")
        if file_path.is_file():
            self._serve_file(file_path)
            return

        self._respond(404, "text/plain", b"Not Found")

    def do_POST(self):
        self._respond(405, "text/plain", b"Method Not Allowed")

    def do_DELETE(self):
        self._respond(405, "text/plain", b"Method Not Allowed")

    # ── API handlers ──────────────────────────────────────────────────────

    def _serve_all_concepts(self):
        """Return all concepts as { id: markdown_source, ... }."""
        concepts = {}
        if CONCEPTS_DIR.is_dir():
            for f in sorted(CONCEPTS_DIR.iterdir()):
                if f.suffix == ".md":
                    concept_id = f.stem
                    with open(f, "r", encoding="utf-8") as fh:
                        concepts[concept_id] = fh.read()
        self._respond_json(concepts)

    def _serve_concept(self, concept_id):
        """Return a single concept's markdown source."""
        safe_id = concept_id.replace("/", "").replace("..", "")
        file_path = CONCEPTS_DIR / f"{safe_id}.md"
        if not file_path.is_file():
            self._respond(404, "application/json",
                          json.dumps({"error": "not found"}).encode())
            return
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        self._respond_json({"id": safe_id, "source": content})

    def _serve_tags(self):
        """Return tag counts: { tag: count, ... }."""
        tags = {}
        if CONCEPTS_DIR.is_dir():
            for f in CONCEPTS_DIR.iterdir():
                if f.suffix != ".md":
                    continue
                with open(f, "r", encoding="utf-8") as fh:
                    src = fh.read()
                # Quick frontmatter tag extraction
                if src.startswith("---"):
                    end = src.find("\n---", 3)
                    if end != -1:
                        fm = src[4:end]
                        for line in fm.split("\n"):
                            line = line.strip()
                            if line.startswith("tags:"):
                                val = line[5:].strip()
                                if val.startswith("[") and val.endswith("]"):
                                    for t in val[1:-1].split(","):
                                        t = t.strip()
                                        if t:
                                            tags[t] = tags.get(t, 0) + 1
        self._respond_json(tags)

    # ── Response helpers ──────────────────────────────────────────────────

    def _respond_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._respond(200, "application/json", body)

    def _respond(self, code, content_type, body):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, file_path):
        file_path = Path(file_path)
        if not file_path.is_file():
            self._respond(404, "text/plain", b"Not Found")
            return

        ext_map = {
            ".html": "text/html",
            ".js":   "application/javascript",
            ".mjs":  "application/javascript",
            ".css":  "text/css",
            ".json": "application/json",
            ".md":   "text/markdown",
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".gif":  "image/gif",
            ".svg":  "image/svg+xml",
            ".ico":  "image/x-icon",
        }
        ct = ext_map.get(file_path.suffix, "application/octet-stream")
        with open(file_path, "rb") as f:
            body = f.read()
        self._respond(200, ct, body)

    def log_message(self, format, *args):
        # Quieter logging
        sys.stderr.write(f"  {args[0]}\n")

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def main():
    os.chdir(PROJECT_ROOT)
    server = http.server.HTTPServer(("", PORT), ConceptTreeHandler)
    print(f"concept-tree demo server running at http://localhost:{PORT}")
    print(f"  project root: {PROJECT_ROOT}")
    print(f"  concepts dir: {CONCEPTS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        server.server_close()


if __name__ == "__main__":
    main()
