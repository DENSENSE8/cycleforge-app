#!/usr/bin/env bash
# workspaceOpen — load in-repo design-mcp + Garisek-OS code-graph Cursor plugins
# so agents get the same plugin-* MCP filesystem paths marketplace servers get.
set -euo pipefail
ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
GARISEK_OS="${GARISEK_OS_ROOT:-/home/michaelgarisek/Projects/Garisek-OS}"
DESIGN_PLUGIN="$ROOT/tools/design-mcp/cursor-plugin"
GRAPH_PLUGIN="$GARISEK_OS/tools/code-graph/cursor-plugin"
python3 - "$DESIGN_PLUGIN" "$GRAPH_PLUGIN" <<'PY'
import json, sys
from pathlib import Path
plugins = [p for p in sys.argv[1:3] if Path(p).is_dir()]
print(json.dumps({"pluginPaths": plugins}))
PY
