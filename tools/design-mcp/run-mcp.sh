#!/usr/bin/env bash
# Launcher for the CycleForge design-system MCP server.
#
# MCP clients spawn this without a login shell, so nvm's node is not on PATH —
# resolved here rather than pinning a version into every client config.
#
# No `--import tsx` (unlike Garisek's): this server reads the contract from the
# filesystem and from tokens.css, never by importing TypeScript, so it boots on
# plain node and cannot be broken by a tsx/loader change.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pick_node() {
  if [ -n "${DESIGN_MCP_NODE:-}" ] && [ -x "${DESIGN_MCP_NODE}" ]; then echo "${DESIGN_MCP_NODE}"; return; fi
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  local latest
  latest="$(ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$latest" ]; then echo "$latest"; return; fi
  echo "node"
}
exec "$(pick_node)" "$HERE/server.mjs" "$@"
