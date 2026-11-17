#!/usr/bin/env python3
"""Facial Symmetry Assistant: static file server + AI proxy. Python 3 standard library only.

AI provider (the API key never reaches the browser):
  - "openai" when OPENAI_API_KEY is set (Render / live testing)
  - "ollama" otherwise (local MedGemma via Ollama)
  Override with AI_PROVIDER=openai|ollama.

Environment:
  PORT                     port (Render sets it; default 8080, or the first CLI argument)
  OPENAI_API_KEY           OpenAI key (set in the Render dashboard, never commit it)
  OPENAI_MODEL             default gpt-5-mini
  OPENAI_BASE_URL          default https://api.openai.com/v1
  OPENAI_REASONING_EFFORT  default low (sent only to reasoning models: gpt-5*, o*)
  OLLAMA_BASE_URL          default http://localhost:11434/v1
  OLLAMA_MODEL             default medgemma1.5
  AI_RATE_LIMIT_PER_HOUR   per client IP, default 60 (protects the key on a public URL)

Routes:
  GET  /api/ai/status                 -> {"available", "provider", "model"}
  POST /api/ai/chat/completions       OpenAI-style body; text messages only, model chosen by the server
  everything else                     static files from this folder
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PROVIDER = os.environ.get("AI_PROVIDER") or ("openai" if os.environ.get("OPENAI_API_KEY") else "ollama")
OPENAI_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
OPENAI_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "low")
OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "medgemma1.5")
RATE = int(os.environ.get("AI_RATE_LIMIT_PER_HOUR", "60"))
MAX_BODY = 100_000
_hits = {}


def model_name():
    return OPENAI_MODEL if PROVIDER == "openai" else OLLAMA_MODEL


def rate_ok(ip):
    now = time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < 3600]
    if len(recent) >= RATE:
        _hits[ip] = recent
        return False
    recent.append(now)
    _hits[ip] = recent
    return True


def upstream_request(body):
    """Translate the browser's request for the configured provider."""
    messages = [{"role": m["role"], "content": m["content"]} for m in body["messages"]]
    max_tokens = min(int(body.get("max_tokens") or 1500), 4000)
    if PROVIDER == "openai":
        model = OPENAI_MODEL
        payload = {"model": model, "messages": messages, "response_format": {"type": "json_object"}}
        if model.startswith(("gpt-5", "o1", "o3", "o4")):
            # reasoning models: no temperature, reasoning tokens count against the completion budget
            payload["max_completion_tokens"] = max_tokens + 6000
            if OPENAI_EFFORT:
                payload["reasoning_effort"] = OPENAI_EFFORT
        else:
            payload["max_completion_tokens"] = max_tokens
            payload["temperature"] = 0
        headers = {"Authorization": "Bearer " + os.environ.get("OPENAI_API_KEY", "")}
        return OPENAI_BASE + "/chat/completions", payload, headers
    # small local models can loop at temperature 0: a little temperature + a repetition penalty prevents it
    payload = {"model": OLLAMA_MODEL, "messages": messages, "temperature": 0.2, "frequency_penalty": 0.4,
               "max_tokens": min(max_tokens, 1200), "seed": 7, "response_format": {"type": "json_object"}}
    return OLLAMA_BASE + "/chat/completions", payload, {}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".mjs": "text/javascript",
                      ".js": "text/javascript", ".task": "application/octet-stream", ".json": "application/json"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Permissions-Policy", "camera=(self), microphone=()")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if not self.path.startswith("/vendor/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def client_ip(self):
        fwd = self.headers.get("X-Forwarded-For")
        return fwd.split(",")[0].strip() if fwd else self.client_address[0]

    def send_json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/ai/status":
            available = PROVIDER == "ollama" or bool(os.environ.get("OPENAI_API_KEY"))
            return self.send_json(200, {"available": available, "provider": PROVIDER, "model": model_name()})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/ai/chat/completions":
            return self.send_json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {"error": "request too large"})
        if not rate_ok(self.client_ip()):
            return self.send_json(429, {"error": "rate limit reached, try again later"})
        try:
            body = json.loads(self.rfile.read(length))
            msgs = body.get("messages")
            if not isinstance(msgs, list) or not msgs or not all(
                    isinstance(m, dict) and m.get("role") in ("system", "user", "assistant") and isinstance(m.get("content"), str)
                    for m in msgs):
                raise ValueError("messages must be a list of text messages")
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": str(e)})

        url, payload, headers = upstream_request(body)
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                     headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                out = json.loads(r.read())
            out["provider"] = PROVIDER
            return self.send_json(200, out)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:400]
            return self.send_json(502, {"error": f"{PROVIDER} returned {e.code}: {detail}"})
        except Exception as e:  # network down, Ollama not running, timeout
            hint = " Is Ollama running (ollama serve)?" if PROVIDER == "ollama" else ""
            return self.send_json(502, {"error": f"could not reach {PROVIDER}: {e}.{hint}"})


def main():
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8080))
    host = "0.0.0.0" if os.environ.get("PORT") or os.environ.get("RENDER") else "127.0.0.1"
    print(f"Facial Symmetry Assistant on http://{'localhost' if host == '127.0.0.1' else host}:{port}  (AI: {PROVIDER}, {model_name()})", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
