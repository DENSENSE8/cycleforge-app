#!/usr/bin/env bash
# Launcher for the CycleForge design-system MCP server.
#
# MCP clients spawn this without a login shell, so nvm's node is not on PATH —
# resolved here rather than pinning a version into every client config.
#
# No `--import tsx` (unlike Garisek's): this server reads TypeScript token
# files as text, never by importing them, so it boots on plain node.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pick_node() {
  if [ -n "${DESIGN_MCP_NODE:-}" ] && [ -x "${DESIGN_MCP_NODE}" ]; then echo "${DESIGN_MCP_NODE}"; return; fi
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  # mise is this machine's version manager; its shim needs no shell activation,
  # which is the whole point when a client spawns us without a login shell.
  if [ -x "$HOME/.local/share/mise/shims/node" ]; then echo "$HOME/.local/share/mise/shims/node"; return; fi
  local latest
  latest="$(ls -1d "$HOME"/.local/share/mise/installs/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$latest" ]; then echo "$latest"; return; fi
  latest="$(ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$latest" ]; then echo "$latest"; return; fi
  echo "node"
}
exec "$(pick_node)" "$HERE/server.mjs" "$@"
