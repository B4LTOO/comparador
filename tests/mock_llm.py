#!/usr/bin/env python3
"""Servidor falso de la API de Anthropic para las pruebas. GET /last devuelve la última petición recibida."""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

last = {}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._send(200, last)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n))
        last.clear()
        last.update({"headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
        if "FALLA" in json.dumps(body["messages"]):
            self._send(500, {"error": {"message": "boom"}})
            return
        self._send(200, {"content": [{"type": "text", "text": "**Te conviene** esto:\n- Opción uno\n- Opción dos\nACCION: cpu a ryzen-7-9800x3d\nACCION: gpu a no-existe-xyz"}]})


HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
