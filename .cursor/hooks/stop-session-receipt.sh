#!/usr/bin/env bash
# stop — best-effort interactive session receipt (FABLE-5.1 §D3). Never blocks.
set -uo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
NODE="${DESIGN_MCP_NODE:-$HOME/.local/share/mise/shims/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"
INPUT=$(cat || true)
if [ -n "$NODE" ]; then
  printf '%s' "$INPUT" | "$NODE" "$ROOT/tools/eval-ledger/session-receipt-stop.mjs" --host cursor >/dev/null 2>&1 || true
fi
echo '{}'
