/** vLLM client: tokenize (CPU side, no inference), streaming chat proxy with usage capture, metrics. */
import { cfg } from "./config.js";

export interface ChatBody { model?: string; messages: { role: string; content: string }[]; max_tokens?: number; stream?: boolean; [k: string]: unknown }

export async function countPromptTokens(messages: ChatBody["messages"]): Promise<{ count: number; estimated: boolean }> {
  try {
    const r = await fetch(`${cfg.vllmUrl}/tokenize`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, add_generation_prompt: true }) });
    if (r.ok) { const j: any = await r.json(); if (typeof j.count === "number") return { count: j.count, estimated: false }; }
  } catch { /* fall through */ }
  const chars = messages.reduce((s, m) => s + (m.content?.length ?? 0) + 8, 0);
  return { count: Math.ceil(chars / 3), estimated: true };   // conservative: ~3 chars per token
}

export interface Usage { prompt_tokens: number; completion_tokens: number; cached_tokens: number }
export interface StreamResult { usage: Usage; ttft_ms: number | null; latency_ms: number; status: number }

/** Proxy a chat completion to vLLM. onChunk receives raw SSE bytes (stream) or the full JSON (non-stream). */
export async function proxyChat(body: ChatBody, onChunk: (b: Uint8Array) => void, signal?: AbortSignal): Promise<StreamResult> {
  const t0 = performance.now();
  const stream = body.stream === true;
  const req = { ...body, model: cfg.model, ...(stream ? { stream_options: { include_usage: true } } : {}) };
  const r = await fetch(`${cfg.vllmUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal });
  const usage: Usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 };
  const readUsage = (u: any) => { if (!u) return; usage.prompt_tokens = u.prompt_tokens ?? 0; usage.completion_tokens = u.completion_tokens ?? 0; usage.cached_tokens = u.prompt_tokens_details?.cached_tokens ?? 0; };
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => "");
    onChunk(new TextEncoder().encode(text));
    return { usage, ttft_ms: null, latency_ms: performance.now() - t0, status: r.status };
  }
  if (!stream) {
    const text = await r.text();
    try { readUsage(JSON.parse(text).usage); } catch { /* ignore */ }
    onChunk(new TextEncoder().encode(text));
    return { usage, ttft_ms: performance.now() - t0, latency_ms: performance.now() - t0, status: r.status };
  }
  let ttft: number | null = null;
  let buf = "";
  const dec = new TextDecoder();
  const reader = r.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (ttft === null) ttft = performance.now() - t0;
    onChunk(value);
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const line = evt.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try { readUsage(JSON.parse(payload).usage); } catch { /* partial */ }
    }
  }
  return { usage, ttft_ms: ttft, latency_ms: performance.now() - t0, status: r.status };
}

export async function models(): Promise<any> {
  const r = await fetch(`${cfg.vllmUrl}/v1/models`); return r.json();
}

const LINE = /^([A-Za-z_:][A-Za-z0-9_:]*)(\{[^}]*\})?\s+([-+0-9.eE]+)/;
export function parseProm(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of text.split("\n")) { if (!l || l[0] === "#") continue; const m = LINE.exec(l); if (m) out[m[1]] = (out[m[1]] ?? 0) + Number(m[3]); }
  return out;
}
const first = (d: Record<string, number>, ...names: string[]) => { for (const n of names) if (n in d) return d[n]; return null; };
export async function metricsSnapshot(): Promise<{ request_success: number | null; l1_hits: number | null; l2_hits: number | null; kv_usage: number | null }> {
  const get = async (u: string) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(3000) }); return parseProm(await r.text()); } catch { return {}; } };
  const [v, l] = await Promise.all([get(`${cfg.vllmUrl}/metrics`), get(cfg.lmcacheMetricsUrl)]);
  return {
    request_success: first(v, "vllm:request_success_total", "vllm:request_success"),
    l1_hits: first(l, "lmcache_mp_lookup_hit_l1_total", "lmcache_mp_lookup_hit_l1_tokens_total", "lmcache_mp_lookup_hit_l1"),
    l2_hits: first(l, "lmcache_mp_lookup_hit_l2_total", "lmcache_mp_lookup_hit_l2_tokens_total", "lmcache_mp_lookup_hit_l2"),
    kv_usage: first(v, "vllm:kv_cache_usage_perc", "vllm:gpu_cache_usage_perc"),
  };
}
