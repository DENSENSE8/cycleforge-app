#!/usr/bin/env bash
# Acceptance for the Cursor preToolUse gates (FABLE-5.1 D7 items 8, 9, 11).
#   bash tools/eval-ledger/pretool-hooks.test.sh
# Runs each hook against a stdin payload with a scratch ROOT so the real
# session stamps are never touched. Exit 1 on the first failing case.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.cursor" "$TMP/tools/design-mcp"
cp "$REPO/tools/design-mcp/router.json" "$TMP/tools/design-mcp/router.json"
NOW_MS=$(( $(date +%s) * 1000 ))
fails=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n  got: %s\n' "$1" "$2"; fails=$((fails + 1)); }
expect() { # name, hook, payload, expected-permission, [grep-in-agent-message]
  local name="$1" hook="$2" payload="$3" want="$4" needle="${5:-}"
  local out
  out="$(printf '%s' "$payload" | CURSOR_PROJECT_DIR="$TMP" GARISEK_OS_ROOT="/g" bash "$REPO/.cursor/hooks/$hook")"
  local perm
  perm="$(printf '%s' "$out" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("permission"))')"
  if [ "$perm" != "$want" ]; then fail "$name" "$out"; return; fi
  if [ -n "$needle" ] && ! printf '%s' "$out" | grep -q -- "$needle"; then fail "$name (message)" "$out"; return; fi
  pass "$name"
}
ENGINE='{"tool_name":"Write","tool_input":{"path":"src/components/tables/compound/CompoundCells.tsx"}}'
PLAIN='{"tool_name":"Write","tool_input":{"path":"src/components/dashboard/DashboardOrdersView.tsx"}}'
UI='{"tool_name":"Write","tool_input":{"path":"src/components/tables/DataTable.tsx"}}'

# ---- item 8: engine graph gate ------------------------------------------
rm -f "$TMP/.cursor/code-graph-session.json"
expect "8: engine file, no stamp → deny with impact command" pretool-engine-graph.sh "$ENGINE" deny "cg.mjs find"
printf '{"source":"cli","lastTool":"stamp","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/code-graph-session.json"
expect "8: engine file, cg.mjs stamp only → deny" pretool-engine-graph.sh "$ENGINE" deny "stamp-only"
printf '{"source":"cli","lastTool":"impact_analysis","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/code-graph-session.json"
expect "8: engine file after cg.mjs impact → allow" pretool-engine-graph.sh "$ENGINE" allow
printf '{"source":"mcp","lastTool":"find_symbol","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/code-graph-session.json"
expect "8: engine file after native find_symbol → allow" pretool-engine-graph.sh "$ENGINE" allow
printf '{"source":"mcp","lastTool":"graph_stats","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/code-graph-session.json"
expect "8: graph_stats is not an oracle call → deny" pretool-engine-graph.sh "$ENGINE" deny
printf '{"source":"cli","lastTool":"impact_analysis","updatedMs":%s}\n' "$(( NOW_MS - 3 * 3600 * 1000 ))" > "$TMP/.cursor/code-graph-session.json"
expect "8: stale impact stamp → deny" pretool-engine-graph.sh "$ENGINE" deny
rm -f "$TMP/.cursor/code-graph-session.json"
expect "8: non-engine file → allow (fail open)" pretool-engine-graph.sh "$PLAIN" allow
rm -f "$TMP/tools/design-mcp/router.json"
expect "8: router.json missing → allow (fail open)" pretool-engine-graph.sh "$ENGINE" allow
cp "$REPO/tools/design-mcp/router.json" "$TMP/tools/design-mcp/router.json"

# ---- item 9: strict design stamps ---------------------------------------
printf '{"source":"stamp","lastTool":null,"updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/design-mcp-session.json"
expect "9: lax, ds.mjs stamp only → allow (unchanged)" pretool-ui-design-mcp.sh "$UI" allow
out="$(printf '%s' "$UI" | CURSOR_PROJECT_DIR="$TMP" CYCLEFORGE_STAMP_STRICT=1 bash "$REPO/.cursor/hooks/pretool-ui-design-mcp.sh")"
if printf '%s' "$out" | grep -q '"deny"' && printf '%s' "$out" | grep -q 'strict'; then pass "9: strict + ds.mjs stamp only → deny"; else fail "9: strict + stamp only" "$out"; fi
printf '{"source":"cli","lastTool":"ds_contract","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/design-mcp-session.json"
out="$(printf '%s' "$UI" | CURSOR_PROJECT_DIR="$TMP" CYCLEFORGE_STAMP_STRICT=1 bash "$REPO/.cursor/hooks/pretool-ui-design-mcp.sh")"
if printf '%s' "$out" | grep -q '"allow"'; then pass "9: strict + ds.mjs contract → allow"; else fail "9: strict + contract" "$out"; fi
printf '{"source":"cli","lastTool":"stamp","updatedMs":%s}\n' "$NOW_MS" > "$TMP/.cursor/design-mcp-session.json"
touch "$TMP/.cursor/stamp-strict"
expect "9: .cursor/stamp-strict file + non-oracle lastTool → deny" pretool-ui-design-mcp.sh "$UI" deny "strict"
rm -f "$TMP/.cursor/stamp-strict"

# ---- item 11: ledger / goal guard ---------------------------------------
expect "11: LEDGER.md → deny" pretool-ledger-guard.sh '{"tool_name":"Write","tool_input":{"path":"docs/eval/cohorts/slot-table/LEDGER.md"}}' deny "human sections"
expect "11: station LEDGER.md (absolute) → deny" pretool-ledger-guard.sh "{\"tool_name\":\"StrReplace\",\"tool_input\":{\"path\":\"$REPO/docs/eval/stations/pack/LEDGER.md\"}}" deny
expect "11: goal file → deny" pretool-ledger-guard.sh '{"tool_name":"Write","tool_input":{"path":"docs/eval/goals/data-headers-sortable.goal.json"}}' deny "human-authored"
expect "11: session mirror → deny" pretool-ledger-guard.sh '{"tool_name":"Write","tool_input":{"path":"docs/eval/sessions/2026-09.jsonl"}}' deny
expect "11: snapshot file → allow" pretool-ledger-guard.sh '{"tool_name":"Write","tool_input":{"path":"docs/eval/cohorts/slot-table/snapshots/2026-09-02-discover.json"}}' allow
expect "11: source file → allow" pretool-ledger-guard.sh "$PLAIN" allow

# Claude Code twin (settings.json inline guard) — same three paths.
CC_GUARD="$(python3 -c 'import json;s=json.load(open("'"$REPO"'/.claude/settings.json"));print([h["command"] for e in s["hooks"]["PreToolUse"] if e.get("matcher")=="Edit|Write|MultiEdit" for h in e["hooks"] if "docs/eval/goals" in h["command"]][0])')"
for p in docs/eval/cohorts/slot-table/LEDGER.md docs/eval/goals/x.goal.json docs/eval/sessions/2026-09.jsonl; do
  if printf '{"tool_input":{"file_path":"%s/%s"}}' "$REPO" "$p" | bash -c "$CC_GUARD" 2>/dev/null; then fail "11: claude-code guard $p" "exit 0"; else pass "11: claude-code guard denies $p"; fi
done
if printf '{"tool_input":{"file_path":"%s/src/x.ts"}}' "$REPO" | bash -c "$CC_GUARD" 2>/dev/null; then pass "11: claude-code guard allows src"; else fail "11: claude-code guard src" "exit 2"; fi

if [ "$fails" -ne 0 ]; then echo "$fails failing case(s)"; exit 1; fi
echo "all preToolUse gate cases pass"
