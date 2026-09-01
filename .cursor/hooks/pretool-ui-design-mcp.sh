#!/usr/bin/env bash
# preToolUse — block UI file writes without a fresh design-mcp stamp.
# Fail open on non-UI paths and on stamp/CLI infrastructure bugs.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
INPUT=$(cat)
python3 - "$ROOT" "$INPUT" <<'PY'
import json, os, re, sys, time
from pathlib import Path

root = Path(sys.argv[1])
try:
    payload = json.loads(sys.argv[2] or "{}")
except Exception:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

tool = str(payload.get("tool_name") or payload.get("toolName") or "")
tin = payload.get("tool_input") or payload.get("arguments") or {}
path = (
    tin.get("path")
    or tin.get("file_path")
    or tin.get("target_notebook")
    or ""
)
path = str(path)

# Only gate agent writes that touch UI source.
ui = bool(
    re.search(r"(^|/)src/.+\.(tsx|jsx|css)$", path)
    or re.search(r"(^|/)src/design-system/.+\.(ts|tsx)$", path)
)
if not ui:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

# Allow editing the design-mcp tooling / pins themselves without a prior stamp
# of the same session (chicken-egg).
if re.search(
    r"(design-mcp|pinned\.json|/tools/design-mcp/)",
    path,
):
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

stamp_path = root / ".cursor" / "design-mcp-session.json"
max_age_ms = int(os.environ.get("CYCLEFORGE_DESIGN_MCP_STAMP_MAX_MS", str(45 * 60 * 1000)))
now_ms = int(time.time() * 1000)
fresh = False
detail = "missing"
if stamp_path.exists():
    try:
        stamp = json.loads(stamp_path.read_text())
        age = now_ms - int(stamp.get("updatedMs") or 0)
        fresh = age >= 0 and age <= max_age_ms
        detail = f"age_ms={age} source={stamp.get('source')} last={stamp.get('lastTool')}"
    except Exception as e:
        detail = f"unreadable:{e}"

if fresh:
    print(json.dumps({"permission": "allow"}))
    raise SystemExit(0)

msg = (
    "UI write blocked: no fresh design-mcp stamp. "
    "Call ds_contract + ds_tokens (native MCP) or "
    "`node tools/design-mcp/ds.mjs contract \"<job>\"` then "
    "`node tools/design-mcp/ds.mjs tokens <axis>` before editing "
    f"{path}. ({detail})"
)
print(
    json.dumps(
        {
            "permission": "deny",
            "user_message": "Design-mcp required before UI edits.",
            "agent_message": msg,
        }
    )
)
PY
