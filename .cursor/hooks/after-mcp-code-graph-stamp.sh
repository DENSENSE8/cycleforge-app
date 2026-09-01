#!/usr/bin/env bash
# afterMCPExecution — stamp when native code-graph tools succeed.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
INPUT=$(cat)
python3 - "$ROOT" "$INPUT" <<'PY'
import json, sys, time
from pathlib import Path

root = Path(sys.argv[1])
try:
    payload = json.loads(sys.argv[2] or "{}")
except Exception:
    payload = {}

tool = str(payload.get("tool_name") or payload.get("toolName") or "")
name = tool.split("/")[-1] if "/" in tool else tool
name = name.split(":")[-1]

GRAPH_TOOLS = {
    "search_code",
    "find_symbol",
    "get_call_graph",
    "impact_analysis",
    "find_path",
    "graph_stats",
    "list_projects",
}
if name not in GRAPH_TOOLS:
    print("{}")
    raise SystemExit(0)

stamp_path = root / ".cursor" / "code-graph-session.json"
prev = {}
if stamp_path.exists():
    try:
        prev = json.loads(stamp_path.read_text())
    except Exception:
        prev = {}

now = time.time()
prev.update({
    "source": "mcp",
    "lastTool": name,
    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
    "updatedMs": int(now * 1000),
    "targetRepo": str(root),
})
stamp_path.parent.mkdir(parents=True, exist_ok=True)
stamp_path.write_text(json.dumps(prev, indent=2) + "\n")
print("{}")
PY
