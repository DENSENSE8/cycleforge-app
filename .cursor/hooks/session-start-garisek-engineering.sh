#!/usr/bin/env bash
# sessionStart — inject code-graph + eval engineering law; stamp graph stats.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
GARISEK_OS="${GARISEK_OS_ROOT:-/home/michaelgarisek/Projects/Garisek-OS}"
NODE="${CODE_GRAPH_NODE:-${DESIGN_MCP_NODE:-$HOME/.local/share/mise/shims/node}}"
CG="$GARISEK_OS/tools/code-graph/cg.mjs"

STATS=""
if [ -x "$NODE" ] && [ -f "$CG" ]; then
  export CODE_GRAPH_TARGET_REPO="$ROOT"
  export CODE_GRAPH_PROJECT="${CODE_GRAPH_PROJECT:-cycleforge-app}"
  # No pre-seeded graph stamp under strict stamps (D7 items 8/9): the engine
  # graph gate accepts only find_symbol / impact_analysis / search_code.
  if [ "${CYCLEFORGE_STAMP_STRICT:-0}" != "1" ] && [ ! -e "$ROOT/.cursor/stamp-strict" ]; then
    "$NODE" "$CG" stamp >/dev/null 2>&1 || true
  fi
  STATS="$("$NODE" "$CG" stats 2>/dev/null || true)"
fi

SUMMARY=$(python3 - "$STATS" <<'PY'
import json, sys
raw = sys.argv[1] or ""
out = None
try:
    data = json.loads(raw)
    totals = data.get("totals") or {}
    out = {
        "project": data.get("project"),
        "status": data.get("status"),
        "last_built_at": data.get("last_built_at"),
        "nodes": totals.get("nodes"),
        "edges": totals.get("edges"),
        "embedded": totals.get("embedded"),
    }
except Exception:
    pass
print(json.dumps(out) if out else "null")
PY
)

python3 - "$SUMMARY" "$GARISEK_OS" "$ROOT" <<'PY'
import json, sys
stats = sys.argv[1]
garisek = sys.argv[2]
root = sys.argv[3]
ctx = f"""# Garisek graph + eval engineering (session)

Project `.cursor/mcp.json` registers **code-graph** (Garisek-OS) alongside design-mcp.
Cursor often fails to surface project stdio MCP tools — close the gap every session.

## Code graph (before non-trivial edits)

1. Prefer native MCP tools when `GetDynamicTools` lists them:
   `search_code`, `find_symbol`, `get_call_graph`, `impact_analysis`, `find_path`, `graph_stats`.
2. If the catalog is empty, use the CLI (same handlers):
   - `node {garisek}/tools/code-graph/cg.mjs stats`
   - `node {garisek}/tools/code-graph/cg.mjs find <SymbolName>`
   - `node {garisek}/tools/code-graph/cg.mjs impact <node_key>`
   - `node {garisek}/tools/code-graph/cg.mjs search "<intent>"`
3. **Workflow:** find_symbol → impact_analysis (or get_call_graph callers) **before** editing shared components, hooks, or table layouts.
4. Default project: `cycleforge-app`. Rebuild index from Garisek-OS if stale:
   `node tools/code-graph/index-cli.mjs --path {root} --name cycleforge-app`

## Eval engineering (before claiming done)

1. Run target verify before finishing a coding task:
   - Fast gate: `node {garisek}/tools/eval-engineering/cursor-eval.mjs --root . --fast`
   - Full gate: same with `--full` (runs `pnpm run verify`)
2. **Scan-station overlay shell** (SoT = all floor peers, not Pack/Unbox alone):
   - After overlay-shell edits: `pnpm run eval:station <id>`
   - Display eval is slot-table only — there is no `eval:cohort overlay`
   - Shell law: `src/lib/station/scan-station-overlay-cohort.ts` · pin: `ScanStationOverlayShell`
3. **Slot-table cohort** (the only display eval — SoT = engine + PRODUCT_TABLES):
   - After CompoundItem / useSlotTableLayout / listing-face edits:
     `pnpm run eval:cohort slot-table -- --skip-verify`
   - Before claiming done: `pnpm run eval:cohort slot-table`
   - Hand GRID leftovers: `pnpm run eval:discover` — one DELETE id per session;
     never KEEP (engine / materializations / catalogs / layout hooks)
   - Ledger: `docs/eval/cohorts/slot-table/LEDGER.md` · pin: `CompoundItem`
4. Full Garisek ratchet (DB baseline): `npx tsx scripts/ratchet-run.ts --repo cycleforge-app --dry-run` from Garisek-OS.
5. Loops conformance is Garisek-OS-only: `npm run check:loops` — not every Cursor session.

## Smoke
- Graph clients: `node {garisek}/tools/code-graph/verify-clients.mjs`
"""
if stats and stats != "null":
    ctx += "\n## graph_stats this session\n```json\n" + stats + "\n```\n"
print(json.dumps({
    "additional_context": ctx,
    "env": {
        "GARISEK_OS_ROOT": garisek,
        "CODE_GRAPH_CLI": f"node {garisek}/tools/code-graph/cg.mjs",
        "CURSOR_EVAL_CLI": f"node {garisek}/tools/eval-engineering/cursor-eval.mjs",
        "CODE_GRAPH_PROJECT": "cycleforge-app",
        "CYCLEFORGE_EVAL_COHORT": "pnpm run eval:cohort slot-table|shortcuts",
    },
}))
PY
