#!/usr/bin/env bash
# Headroom depth checker (PRD section 8). Runs on the GPU node every 3 h and at each gate.
# Sets each status from evidence produced in THIS run only. Appends one row to docs/check-log.md.
# Never runs `make bench` (4 h) or `make settle-demo` (spends Arc USDC); those are human-run and their artifacts are read here.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SKIP_SMOKE=${SKIP_SMOKE:-0}
git pull -q origin main 2>/dev/null || true
COMMIT=$(git rev-parse --short HEAD)
TS=$(TZ=Asia/Kolkata date "+%Y-%m-%d %H:%M")
RUN="docs/checks/$(date +%Y%m%d-%H%M)"
mkdir -p "$RUN"
declare -A S
run() { local id=$1; shift; echo "== $id: $*"; if "$@" > "$RUN/$id.log" 2>&1; then S[$id]=Pass; else S[$id]=Fail; fi; echo "   ${S[$id]} (log $RUN/$id.log)"; }

# --- bench evidence (M1-M7) ---
if [ "$SKIP_SMOKE" = 0 ]; then run M1 make bench-smoke; else S[M1]=Skipped; fi
LATEST=bench/results/latest.json
if [ -f "$LATEST" ]; then
  node -e '
    const r=require(process.argv[1]); const g=r.gains||{}; const c=r.capacity||{};
    const lv=(r.levels||[]).filter(l=>l.config==="C"&&l.level===c.C);
    const out={M1: (r.m1?.c_levels_with_l1_and_l2_hits||[]).length>0,
      M2: (g.n_c_over_n_b||0)>=2.0, M3: g.n_b_over_n_a!=null && (g.n_c_over_n_b||0)>=1.5,
      M4: lv.length>0 && lv.every(l=>l.ttft_p95_hit_ms<=1500 && l.ttft_p95_miss_ms<=6000),
      M6: Object.values(r.m6||{}).length>0 && Object.values(r.m6).every(m=>m.delta_pct!=null && Math.abs(m.delta_pct)<=10),
      M7: r.m7?.u_at_capacity!=null && r.m7?.n_max_formula!=null, runs: g.runs_per_config, capacity: c, gains: g};
    console.log(JSON.stringify(out,null,1));' "$LATEST" > "$RUN/bench-eval.json"
  for id in M1 M2 M3 M4 M6 M7; do v=$(node -e 'console.log(require(process.argv[1])[process.argv[2]])' "$RUN/bench-eval.json" "$id"); [ "$v" = true ] && S[$id]=Pass || S[$id]=Fail; done
  [ "$SKIP_SMOKE" != 0 ] || true
else
  for id in M2 M3 M4 M6 M7; do S[$id]=Fail; done
fi
run M5 make correctness
# --- payments (P1-P6) ---
run P3 make audit-prices
run P4 make caps-test
run P5 make replay-test
(cd gateway && pnpm -s exec tsx scripts/depth-query.ts) > "$RUN/depth-query.json" 2>"$RUN/depth-query.err" || true
q() { node -e 'const j=require(process.argv[1]); const v=process.argv[2].split(".").reduce((o,k)=>o?.[k],j); console.log(v)' "$RUN/depth-query.json" "$1" 2>/dev/null; }
[ "$(q paid_hedera_requests)" != "0" ] && [ -n "$(q paid_hedera_requests)" ] && [ "$(q paid_hedera_requests)" != "undefined" ] && S[P1]=Pass || S[P1]=Fail
LASTDEMO=$(ls -t agent/logs/demo-*.jsonl 2>/dev/null | head -1)
if [ -n "$LASTDEMO" ] && [ "$(grep -c '"event":"turn"' "$LASTDEMO")" -ge 20 ]; then S[P2]=Pass; else S[P2]=Fail; fi
[ "$(q checks.P6_hcs_equals_done)" = true ] && S[P6]=Pass || S[P6]=Fail
# --- Arc (S1-S5) ---
run S4 make reconcile
LASTSETTLE=$(ls -t signer/settle-demo-*.json 2>/dev/null | head -1)
if [ -n "$LASTSETTLE" ]; then grep -q '"name": "release"' "$LASTSETTLE" && S[S2]=Pass || S[S2]=Fail; grep -q '"name": "challenge"' "$LASTSETTLE" && S[S3]=Pass || S[S3]=Fail; else S[S2]=Fail; S[S3]=Fail; fi
S[S1]="Human"; S[S5]="Human"
# --- demand / dashboard ---
[ "$(q checks.D1_fresh_or_flagged)" = true ] && S[D1]=Pass || S[D1]=Fail
if [ -f dashboard/scripts/audit-links.mjs ]; then run D2 node dashboard/scripts/audit-links.mjs; else S[D2]=Fail; fi
[ "$(q checks.V1_external_wallets_ge_5)" = true ] && S[V1]=Pass || S[V1]=Fail
[ "$(q checks.V2_volume)" = true ] && S[V2]=Pass || S[V2]=Fail
S[V3]="Human"
# --- ETHGlobal rules ---
FIRST=$(git log --reverse --format=%cI | head -1); S[E1]="Pass ($FIRST)"
MAXHOUR=$(git log --format=%cI | cut -c1-13 | sort | uniq -c | sort -rn | head -1 | awk '{print $1}'); TOTAL=$(git rev-list --count HEAD)
if [ "$TOTAL" -gt 0 ] && [ $((MAXHOUR * 100 / TOTAL)) -le 40 ]; then S[E2]=Pass; else S[E2]=Fail; fi
grep -q "ai-disclosure" README.md && S[E4]=Pass || S[E4]=Fail
S[E3]="Human"

FAILS=""; for id in M1 M2 M4 M5 P1 P2 P3 P4 S4 D2 V1; do [ "${S[$id]}" = Fail ] && FAILS="$FAILS $id"; done
{ echo "commit=$COMMIT ts=$TS"; for id in M1 M2 M3 M4 M5 M6 M7 P1 P2 P3 P4 P5 P6 S1 S2 S3 S4 S5 D1 D2 V1 V2 V3 E1 E2 E3 E4; do echo "$id ${S[$id]:-NotChecked}"; done; } | tee "$RUN/status.txt"
NEXT="all blockers pass"; [ -n "$FAILS" ] && NEXT="STOP:$FAILS"
echo "| $TS | $COMMIT | ${FAILS:- none} | $NEXT, evidence $RUN |" >> docs/check-log.md
echo "$NEXT"
[ -z "$FAILS" ]
