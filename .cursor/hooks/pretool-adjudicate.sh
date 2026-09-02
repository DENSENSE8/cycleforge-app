#!/usr/bin/env bash
# preToolUse — the shared design-system adjudicator, Cursor door (gap report §G.2 item 5).
# One rule module (Garisek scripts/guard/adjudicate.mjs) reads this repo's
# router.json refuse rules + the base rules design-mcp.profile.json adopts.
# Closed on rules, open on infrastructure: a missing engine allows the write.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
GARISEK_OS="${GARISEK_OS_ROOT:-/home/michaelgarisek/Projects/Garisek-OS}"
NODE="${DESIGN_MCP_NODE:-$HOME/.local/share/mise/shims/node}"
HOOK="$GARISEK_OS/scripts/guard/adjudicate-hook.mjs"
if [ ! -x "$NODE" ]; then NODE="$(command -v node || true)"; fi
if [ -z "$NODE" ] || [ ! -f "$HOOK" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi
DESIGN_MCP_TARGET="$ROOT" "$NODE" "$HOOK" --cursor || echo '{"permission":"allow"}'
