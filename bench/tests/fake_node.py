#!/usr/bin/env python3
"""Fake OpenAI-compatible node for harness unit tests only. Never used in the demo path.
Serves /v1/completions, streaming /v1/chat/completions with usage, /metrics (vLLM + LMCache MP names), /health.
Usage: python3 bench/tests/fake_node.py --port 18000 --lm-port 18080
"""
import argparse, json, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"req": 0, "hits": 0}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True})
        elif self.path == "/metrics":
            STATE["hits"] += 1
            body = (f"vllm:kv_cache_usage_perc 0.42\nvllm:prefix_cache_hits_total {STATE['hits']*100}\n"
                    f"vllm:external_prefix_cache_hits_total {STATE['hits']*50}\nvllm:num_preemptions_total 0\n"
                    f"vllm:request_success_total {STATE['req']}\n"
                    f'lmcache_mp_lookup_hit_l1_total{{model_name="m",cache_salt=""}} {STATE["hits"]*300}\n'
                    f'lmcache_mp_lookup_hit_l2_total{{model_name="m",cache_salt=""}} {STATE["hits"]*20}\n'
                    f"lmcache_mp_l1_memory_usage_bytes 1024\n")
            b = body.encode(); self.send_response(200); self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        else:
            self._json(404, {})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        STATE["req"] += 1
        if self.path == "/v1/completions":
            words = len(body.get("prompt", "").split())
            self._json(200, {"choices": [{"text": " ok"}], "usage": {"prompt_tokens": int(words * 1.3) + 1, "completion_tokens": 1}})
        elif self.path == "/v1/chat/completions":
            words = sum(len(m["content"].split()) for m in body["messages"])
            pt = int(words * 1.3); mt = body.get("max_tokens", 8)
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            time.sleep(0.05)
            for i in range(min(mt, 5)):
                self.wfile.write(f'data: {json.dumps({"choices":[{"delta":{"content":f"tok{i} "}}]})}\n\n'.encode()); self.wfile.flush()
                time.sleep(0.01)
            usage = {"prompt_tokens": pt, "completion_tokens": mt, "prompt_tokens_details": {"cached_tokens": pt // 2}}
            self.wfile.write(f'data: {json.dumps({"choices":[],"usage":usage})}\n\n'.encode())
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        else:
            self._json(404, {})

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=18000); ap.add_argument("--lm-port", type=int, default=18080)
    a = ap.parse_args()
    for p in (a.port, a.lm_port):
        threading.Thread(target=ThreadingHTTPServer(("127.0.0.1", p), H).serve_forever, daemon=True).start()
    print(f"fake node on {a.port} and {a.lm_port}", flush=True)
    while True:
        time.sleep(3600)

if __name__ == "__main__":
    main()
