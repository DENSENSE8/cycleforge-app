#!/usr/bin/env bash
# workspaceOpen — load the in-repo design-mcp as a Cursor plugin so agents get
# the same plugin-* MCP filesystem path that marketplace servers get.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PLUGIN="$ROOT/tools/design-mcp/cursor-plugin"
python3 - "$PLUGIN" <<'PY'
import json, sys
print(json.dumps({"pluginPaths": [sys.argv[1]]}))
PY
