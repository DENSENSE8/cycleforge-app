#!/usr/bin/env bash
# preToolUse — graph gate on prompt-router engine files (FABLE-5.1 D7 item 8).
#
# A Write/StrReplace to a file the router lists as a cohort `engineFiles`
# entry is denied unless the code-graph stamp is fresh AND came from a real
# oracle call (find_symbol / impact_analysis / search_code). `cg.mjs stamp`
# alone (source=cli, lastTool=stamp) never satisfies it — a stamp that proves
# nothing about the edit is the G2 hole this closes.
#
# Fail open on non-engine paths and on infrastructure errors (no router.json,
# unreadable payload): a guard that breaks must not silently block all work,
# and the unattended rail has its own hard gate in goal-run.ts.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
GARISEK_OS="${GARISEK_OS_ROOT:-/home/michaelgarisek/Projects/Garisek-OS}"
INPUT=$(cat)
python3 - "$ROOT" "$GARISEK_OS" "$INPUT" <<'PY'
import json, os, sys, time
from pathlib import Path

root = Path(sys.argv[1])
garisek = sys.argv[2]
try:
    payload = json.loads(sys.argv[3] or "{}")
except Exception:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

tin = payload.get("tool_input") or payload.get("arguments") or {}
path = str(tin.get("path") or tin.get("file_path") or tin.get("target_notebook") or "")
if not path:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

rel = path.replace("\\", "/")
root_s = str(root).replace("\\", "/").rstrip("/") + "/"
if rel.startswith(root_s):
    rel = rel[len(root_s):]
rel = rel[2:] if rel.startswith("./") else rel

router_path = root / "tools" / "design-mcp" / "router.json"
try:
    router = json.loads(router_path.read_text())
except Exception:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

route = None
for r in router.get("routes") or []:
    for f in r.get("engineFiles") or []:
        nf = str(f).replace("\\", "/")
        if rel == nf or rel.endswith("/" + nf):
            route = r
            break
    if route:
        break

if not route:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

ORACLE_TOOLS = {"find_symbol", "impact_analysis", "search_code"}
stamp_path = root / ".cursor" / "code-graph-session.json"
max_age_ms = int(os.environ.get("CYCLEFORGE_CODE_GRAPH_STAMP_MAX_MS", str(45 * 60 * 1000)))
now_ms = int(time.time() * 1000)
ok = False
detail = "stamp missing"
if stamp_path.exists():
    try:
        stamp = json.loads(stamp_path.read_text())
        age = now_ms - int(stamp.get("updatedMs") or 0)
        fresh = 0 <= age <= max_age_ms
        source = str(stamp.get("source") or "")
        last = str(stamp.get("lastTool") or "")
        oracle = source != "stamp" and last in ORACLE_TOOLS
        ok = fresh and oracle
        detail = f"age_ms={age} source={source} lastTool={last or 'none'}"
        if fresh and not oracle:
            detail += " (stamp-only is not an oracle call)"
    except Exception as e:
        detail = f"stamp unreadable:{e}"

if ok:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

symbols = list(route.get("graphSymbols") or [])[:5]
sym = symbols[0] if symbols else "<Symbol>"
cg = f"node {garisek}/tools/code-graph/cg.mjs"
msg = (
    f"Graph gate: {rel} is a `{route.get('cohort')}` engine file. "
    f"Before editing it run `{cg} find {sym}` then `{cg} impact <node_key>` "
    f"(or native find_symbol → impact_analysis). Symbols for this route: "
    f"{', '.join(symbols) or 'none'}. Eval after: `{route.get('evalCommand')}`. ({detail})"
)
print(
    json.dumps(
        {
            "permission": "deny",
            "user_message": "Code-graph impact required before engine edits.",
            "agent_message": msg,
        }
    )
)
PY
