#!/usr/bin/env bash
# sessionStart — inject design-system routing law + dumb-station mouth recipe.
# Fire-and-forget for the agent loop; still stamps a session receipt.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
NODE="${DESIGN_MCP_NODE:-$HOME/.local/share/mise/shims/node}"
DS="$ROOT/tools/design-mcp/ds.mjs"

CONTRACT=""
STRICT=0
if [ "${CYCLEFORGE_STAMP_STRICT:-0}" = "1" ] || [ -e "$ROOT/.cursor/stamp-strict" ]; then STRICT=1; fi
if [ -x "$NODE" ] && [ -f "$DS" ]; then
  # Leave a stamp so the first UI write in a fresh session is not blocked solely
  # because MCP tools were missing from the catalog — unless stamps are strict
  # (D7 item 9): then only a real oracle call may stamp, never session start.
  if [ "$STRICT" != "1" ]; then
    "$NODE" "$DS" stamp >/dev/null 2>&1 || true
  fi
  CONTRACT="$("$NODE" "$DS" contract "dumb station scan mouth gun only context ring" --limit 5 2>/dev/null || true)"
fi
# Keep the injected blob bounded — top match + naming law only.
SUMMARY=$(python3 - "$CONTRACT" <<'PY'
import json, sys
raw = sys.argv[1] or ""
top = None
try:
    data = json.loads(raw)
    matches = data.get("matches") or []
    if matches:
        m = matches[0]
        top = {
            "id": m.get("id"),
            "import": m.get("import"),
            "useWhen": m.get("useWhen"),
            "doNot": m.get("doNot"),
            "law": m.get("law"),
        }
except Exception:
    pass
print(json.dumps(top) if top else "null")
PY
)

python3 - "$SUMMARY" <<'PY'
import json, sys
top = sys.argv[1]
ctx = """# CycleForge design-mcp (session)

Project `.cursor/mcp.json` registers design-mcp, but Cursor often fails to surface project stdio MCP tools to the agent catalog. Close the gap every session:

1. Prefer native MCP tools `ds_contract` / `ds_tokens` / `ds_critique` when `GetDynamicTools` finds them (namespace may be `design-mcp` or `plugin-…-design-mcp`).
2. If the catalog is empty, call the CLI (same handlers):
   - `node tools/design-mcp/ds.mjs contract "<job>"`
   - `node tools/design-mcp/ds.mjs tokens <axis> [--filter …]`
   - `node tools/design-mcp/ds.mjs critique <repo-relative-file>`
3. UI writes to `src/**/*.{tsx,jsx,css}` require a fresh design-mcp stamp (CLI or MCP). Hooks enforce this.

## Naming law
- "Omni Composer" / "station composer" / "station mouth" → **StationComposerHost** (not raw OmnichannelComposerDock).
- Dock alone = outline only (incomplete mouth). Caption row + context ring live on ComposerModeRow under the outline.
- "no modes" / dumb gun station → `showModeRow` + **`showModeFaces={false}`** (keep bottom-right context ring). Never `showModeRow={false}` to hide faces.

## Floor stations
Clone Pack/Unbox station shell first. Do not invent a left recent rail unless explicitly asked. Prefer a thin adapter around StationComposerHost; do not invent *NotesComposer / second scan bars.

## Dumb-station mouth (pinned recipe)
Mount StationComposerHost with showModeFaces={false}. Ring opens Displays for carton verification. White bg-surface-card. One textarea: tracking commit vs note-last.
"""
if top and top != "null":
    ctx += "\n## ds_contract top match this session\n```json\n" + top + "\n```\n"
print(json.dumps({
    "additional_context": ctx,
    "env": {
        "CYCLEFORGE_DESIGN_MCP_CLI": "node tools/design-mcp/ds.mjs",
        "CYCLEFORGE_DESIGN_MCP_REQUIRED": "1",
    },
}))
PY
