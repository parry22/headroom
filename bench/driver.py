#!/usr/bin/env python3
"""Replay driver: N concurrent agent sessions with tool-call gaps against the OpenAI-compatible node.

Workload (PRD 7.3): shared 4K-token prefix; private context grows 8K -> 32K over 8 turns;
256 output tokens per turn; 5-30 s gap between turns; sessions arrive as a Poisson process.
Per turn one CSV row: TTFT, latency, prompt/cached/completion tokens, decode tok/s, hit tag.
Per session one row: measured u = generating time / wall-clock.

Usage: python3 bench/driver.py --config C --level 16 --settle 60 --duration 240 --out bench/results/<run> --run-id r1
"""
from __future__ import annotations
import argparse, asyncio, csv, json, os, random, time
import httpx
from common import MODEL, VLLM_URL, calibrate_tokens_per_word, salad, shared_prefix, words_for

TURN_FIELDS = ["run_id", "config", "level", "slot", "session", "turn", "hit_tag", "t_send", "in_window",
               "ttft_ms", "latency_ms", "prompt_tokens", "cached_tokens", "completion_tokens",
               "decode_tok_s", "error"]
SESSION_FIELDS = ["run_id", "config", "level", "slot", "session", "turns", "gen_s", "wall_s", "u", "in_window"]

class Spec:
    def __init__(self, a):
        self.prefix_tokens = a.prefix_tokens
        self.ctx_start, self.ctx_end, self.turns = a.ctx_start, a.ctx_end, a.turns
        self.out_tokens = a.out_tokens
        self.gap_min, self.gap_max = a.gap_min, a.gap_max
        self.per_turn = (self.ctx_end - self.ctx_start) / max(1, self.turns - 1)

async def one_turn(client: httpx.AsyncClient, messages: list, out_tokens: int, seed: int):
    body = {"model": MODEL, "messages": messages, "max_tokens": out_tokens, "temperature": 0,
            "seed": seed, "stream": True, "stream_options": {"include_usage": True}}
    t0 = time.time()
    ttft = None
    text = []
    usage = {}
    async with client.stream("POST", f"{VLLM_URL}/v1/chat/completions", json=body, timeout=600) as r:
        r.raise_for_status()
        async for line in r.aiter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            obj = json.loads(payload)
            if obj.get("usage"):
                usage = obj["usage"]
            for ch in obj.get("choices", []):
                delta = ch.get("delta", {}).get("content")
                if delta:
                    if ttft is None:
                        ttft = time.time() - t0
                    text.append(delta)
    t1 = time.time()
    return {"t_send": t0, "ttft_s": ttft if ttft is not None else t1 - t0, "latency_s": t1 - t0,
            "text": "".join(text), "usage": usage}

async def run_session(client, spec: Spec, tpw: float, prefix: str, sid: int, slot: int, rng: random.Random,
                      window: tuple[float, float], a, turn_rows: list, session_rows: list, stop_at: float):
    messages = [{"role": "system", "content": prefix}]
    private = salad(100_000 + sid, words_for(spec.ctx_start, tpw))
    messages.append({"role": "user", "content": private + "\n\nSummarize the state and plan the next tool call."})
    gen_s = 0.0
    first_send = None
    last_done = None
    for turn in range(1, spec.turns + 1):
        if time.time() > stop_at:
            break
        seed = sid * 100 + turn
        row = {"run_id": a.run_id, "config": a.config, "level": a.level, "slot": slot, "session": sid,
               "turn": turn, "hit_tag": "miss" if turn == 1 else "hit"}
        try:
            res = await one_turn(client, messages, spec.out_tokens, seed)
            u = res["usage"]
            comp = u.get("completion_tokens") or 0
            decode_s = max(1e-6, res["latency_s"] - res["ttft_s"])
            row.update({"t_send": f"{res['t_send']:.3f}", "ttft_ms": f"{res['ttft_s']*1000:.1f}",
                        "latency_ms": f"{res['latency_s']*1000:.1f}", "prompt_tokens": u.get("prompt_tokens"),
                        "cached_tokens": (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
                        "completion_tokens": comp, "decode_tok_s": f"{comp/decode_s:.2f}", "error": ""})
            messages.append({"role": "assistant", "content": res["text"] or "(empty)"})
            gen_s += res["latency_s"]
            first_send = first_send or res["t_send"]
            last_done = res["t_send"] + res["latency_s"]
        except Exception as e:  # noqa: BLE001
            row.update({"t_send": f"{time.time():.3f}", "error": type(e).__name__ + ":" + str(e)[:80]})
            turn_rows.append({**row, "in_window": int(window[0] <= float(row["t_send"]) < window[1])})
            break
        row["in_window"] = int(window[0] <= float(row["t_send"]) < window[1])
        turn_rows.append(row)
        if turn < spec.turns:
            await asyncio.sleep(rng.uniform(spec.gap_min, spec.gap_max))  # tool-call gap
            tool = salad(200_000 + sid * 10 + turn, words_for(int(spec.per_turn), tpw))
            messages.append({"role": "user", "content": "Tool result:\n" + tool + "\n\nContinue."})
    if first_send and last_done and last_done > first_send:
        wall = last_done - first_send
        session_rows.append({"run_id": a.run_id, "config": a.config, "level": a.level, "slot": slot,
                             "session": sid, "turns": len([r for r in turn_rows if r["session"] == sid and not r["error"]]),
                             "gen_s": f"{gen_s:.2f}", "wall_s": f"{wall:.2f}", "u": f"{gen_s/wall:.4f}",
                             "in_window": int(window[0] <= first_send and last_done <= window[1] + 60)})

async def slot_loop(client, spec, tpw, prefix, slot, start_delay, a, window, turn_rows, session_rows, stop_at, counter):
    await asyncio.sleep(start_delay)
    rng = random.Random(a.seed * 1000 + slot)
    while time.time() < window[1]:
        sid = counter[0]
        counter[0] += 1
        await run_session(client, spec, tpw, prefix, sid, slot, rng, window, a, turn_rows, session_rows, stop_at)

def append_csv(path: str, fields: list[str], rows: list[dict]) -> None:
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if new:
            w.writeheader()
        w.writerows(rows)

async def main_async(a):
    spec = Spec(a)
    os.makedirs(a.out, exist_ok=True)
    with httpx.Client() as c:
        tpw = calibrate_tokens_per_word(c)
    prefix = shared_prefix(words_for(spec.prefix_tokens, tpw))
    rng = random.Random(a.seed)
    t0 = time.time()
    window = (t0 + a.settle, t0 + a.settle + a.duration)
    stop_at = window[1] + a.grace
    # Poisson arrivals: exponential inter-arrival with mean settle/N (all N slots live by the window start).
    mean_gap = max(0.05, (a.settle or 60) / a.level)
    delays, t = [], 0.0
    for _ in range(a.level):
        delays.append(t)
        t += rng.expovariate(1.0 / mean_gap)
    turn_rows: list[dict] = []
    session_rows: list[dict] = []
    counter = [0]
    limits = httpx.Limits(max_connections=a.level + 8, max_keepalive_connections=a.level + 8)
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [asyncio.create_task(slot_loop(client, spec, tpw, prefix, s, delays[s], a, window, turn_rows,
                                               session_rows, stop_at, counter)) for s in range(a.level)]
        try:
            await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=a.settle + a.duration + a.grace + 30)
        except asyncio.TimeoutError:
            for tk in tasks:
                tk.cancel()
    append_csv(os.path.join(a.out, "turns.csv"), TURN_FIELDS, turn_rows)
    append_csv(os.path.join(a.out, "sessions.csv"), SESSION_FIELDS, session_rows)
    inw = [r for r in turn_rows if r["in_window"]]
    errs = [r for r in inw if r["error"]]
    print(json.dumps({"config": a.config, "level": a.level, "tokens_per_word": round(tpw, 3), "turns_total": len(turn_rows),
                      "turns_in_window": len(inw), "errors_in_window": len(errs), "sessions": len(session_rows)}))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--level", type=int, required=True, help="N concurrent sessions")
    ap.add_argument("--settle", type=int, default=60)
    ap.add_argument("--duration", type=int, default=240)
    ap.add_argument("--grace", type=int, default=90, help="seconds after the window to let in-flight turns finish")
    ap.add_argument("--out", required=True)
    ap.add_argument("--run-id", default="r1")
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--prefix-tokens", type=int, default=4096)
    ap.add_argument("--ctx-start", type=int, default=8192)
    ap.add_argument("--ctx-end", type=int, default=32768)
    ap.add_argument("--turns", type=int, default=8)
    ap.add_argument("--out-tokens", type=int, default=256)
    ap.add_argument("--gap-min", type=float, default=5)
    ap.add_argument("--gap-max", type=float, default=30)
    asyncio.run(main_async(ap.parse_args()))

if __name__ == "__main__":
    main()
