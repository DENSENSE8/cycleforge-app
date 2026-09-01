#!/usr/bin/env bash
# afterMCPExecution — stamp when native ds_* tools succeed.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
INPUT=$(cat)
python3 - "$ROOT" "$INPUT" <<'PY'
import json, os, sys, time
from pathlib import Path
root = Path(sys.argv[1])
try:
    payload = json.loads(sys.argv[2] or "{}")
except Exception:
    payload = {}
tool = str(payload.get("tool_name") or payload.get("toolName") or "")
# Match MCP:design-mcp/ds_contract or bare ds_contract
name = tool.split("/")[-1] if "/" in tool else tool
name = name.split(":")[-1]
if name not in {"ds_contract", "ds_tokens", "ds_critique"}:
    print("{}")
    raise SystemExit(0)
stamp_path = root / ".cursor" / "design-mcp-session.json"
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
    "repo": str(root),
})
stamp_path.parent.mkdir(parents=True, exist_ok=True)
stamp_path.write_text(json.dumps(prev, indent=2) + "\n")
print("{}")
PY
