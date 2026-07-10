#!/bin/bash
# Cycle Forge — single-command loop, driven by Hermes.
# Run from a WSL terminal, OR wire it as the shell tool the Hermes orchestrator
# invokes when it receives "/forge <request>" over Telegram.
#
#   Usage:  forge.sh "add Ecwid webhook signature verification"
#
# Optional PWA history stream (Garisek-OS /forge page). When these are set, each
# stage is POSTed to /api/forge/ingest so the run shows up live in the PWA:
#   CYCLE_FORGE_REPO   repo root override (default /mnt/e/USAV-Orders-Backend)
#   FORGE_INGEST_URL   default http://localhost:3000/api/forge/ingest
#   FORGE_INGEST_TOKEN shared secret; must equal the app's FORGE_INGEST_TOKEN.
#
# Keys SoT = Hermes' managed env (`hermes config env-path`, e.g.
# ~/.hermes/profiles/<profile>/.env). This script sources it automatically, so
# FORGE_* keys stored there populate the loop with no hand-exported secrets.
set -euo pipefail

REPO_ROOT="${CYCLE_FORGE_REPO:-/mnt/e/USAV-Orders-Backend}"
OPS="$REPO_ROOT/.cycle_forge_ops"
MANIFEST_DIR="$OPS/manifests"

# Load keys from the Hermes SoT (its managed .env) if available.
HERMES_BIN="${HERMES_BIN:-$HOME/.local/bin/hermes}"
if [ -x "$HERMES_BIN" ]; then
  _HERMES_ENV="$("$HERMES_BIN" config env-path 2>/dev/null || true)"
  if [ -n "$_HERMES_ENV" ] && [ -f "$_HERMES_ENV" ]; then set -a; . "$_HERMES_ENV"; set +a; fi
fi
FORGE_INGEST_URL="${FORGE_INGEST_URL:-http://localhost:3000/api/forge/ingest}"
FORGE_INGEST_TOKEN="${FORGE_INGEST_TOKEN:-}"
mkdir -p "$MANIFEST_DIR"

FEATURE="$*"
[ -z "$FEATURE" ] && { echo "Usage: forge.sh <feature request>"; exit 1; }

RUN_UID=$(date +%Y%m%d-%H%M%S)
MANIFEST="$MANIFEST_DIR/$RUN_UID.md"
BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")

# ── ingest helper — POST run/stage state to the PWA (no-op if unconfigured) ────
# usage: _ingest key=value key=value ...   (values may contain '=' after the first)
_ingest() {
  [ -z "$FORGE_INGEST_TOKEN" ] && return 0
  local json PY
  PY=$(command -v python3 || command -v python || true)
  [ -z "$PY" ] && return 0   # no python → skip ingest silently
  # Best-effort: a broken/aliased python or JSON build must never abort the loop.
  json=$("$PY" - "$@" 2>/dev/null <<'PYJSON'
import json, sys
d = {}
for a in sys.argv[1:]:
    k, _, v = a.partition('=')
    d[k] = v
print(json.dumps(d))
PYJSON
) || return 0
  [ -z "$json" ] && return 0
  curl -sS -m 5 -X POST "$FORGE_INGEST_URL" \
    -H 'content-type: application/json' \
    -H "x-forge-token: $FORGE_INGEST_TOKEN" \
    -d "$json" >/dev/null 2>&1 || echo "   (ingest skipped: PWA unreachable)"
}

_ingest runUid="$RUN_UID" feature="$FEATURE" branch="$BRANCH" manifestPath="$MANIFEST" runStatus=running

# ── [1/4] ARCHITECT ─ orchestrator profile designs the MFM manifest ────────────
echo "🧠 [1/4] ARCHITECT — designing manifest via Hermes orchestrator..."
_ingest runUid="$RUN_UID" stage=architect stageStatus=running
hermes -p orchestrator chat "$(cat "$OPS/prompts/ARCHITECT_SYSTEM.md")

FEATURE REQUEST: $FEATURE" > "$MANIFEST"
echo "   → manifest saved: $MANIFEST"
_ingest runUid="$RUN_UID" stage=architect stageStatus=ok detail="manifest saved: $RUN_UID.md"

# ── [2/4] BUILD ─ coder profile (Grok 4.5) applies the manifest ────────────────
echo "🔨 [2/4] BUILD — coder (Grok 4.5) applying manifest..."
_ingest runUid="$RUN_UID" stage=build stageStatus=running
hermes -p coder chat "$(cat "$OPS/prompts/CODER_SYSTEM.md")

Apply this Markdown File Manifest exactly against repo root $REPO_ROOT:

$(cat "$MANIFEST")"
_ingest runUid="$RUN_UID" stage=build stageStatus=ok detail="coder applied manifest"

# ── [3/4] SYNC ─ update global memory (Mem0/Honcho) ────────────────────────────
echo "🔁 [3/4] SYNC — updating global memory..."
_ingest runUid="$RUN_UID" stage=sync stageStatus=running
GIT_DIFF=$(git -C "$REPO_ROOT" diff --stat 2>/dev/null || echo "no diff available")
hermes -p orchestrator chat "Cycle Forge state update. Implemented locally: $FEATURE. Git changes: $GIT_DIFF. Ensure the coder and logistics profiles are aware of this state change."
_ingest runUid="$RUN_UID" stage=sync stageStatus=ok detail="memory updated" gitDiffStat="$GIT_DIFF"

# ── [4/4] VERIFY ─ coder runs the manifest's declared test command ─────────────
echo "✅ [4/4] VERIFY — running tests declared in the manifest's ### VERIFY section..."
_ingest runUid="$RUN_UID" stage=verify stageStatus=running
VERIFY_CMD=$(awk '/^### VERIFY/{f=1;next} f&&/npm run|tsx|playwright/{print;exit}' "$MANIFEST" || true)
if [ -n "$VERIFY_CMD" ]; then
  echo "   → $VERIFY_CMD"
  if ( cd "$REPO_ROOT" && eval "$VERIFY_CMD" ); then
    echo "   ✅ tests passed"
    _ingest runUid="$RUN_UID" stage=verify stageStatus=ok detail="$VERIFY_CMD" runStatus=passed
  else
    echo "   ❌ tests failed — inspect $MANIFEST"
    _ingest runUid="$RUN_UID" stage=verify stageStatus=failed detail="$VERIFY_CMD" runStatus=failed
  fi
else
  echo "   ⚠ no VERIFY command found in manifest; run targeted tests manually."
  _ingest runUid="$RUN_UID" stage=verify stageStatus=skipped detail="no VERIFY command in manifest" runStatus=passed
fi

echo ""
echo "🏁 Forge complete. Manifest: $MANIFEST"
