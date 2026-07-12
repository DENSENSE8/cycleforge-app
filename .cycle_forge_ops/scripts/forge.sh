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

# ── Outer loop (ALP-4.1): `forge.sh --next-ticket` picks the first pending
# `<TicketStatus/>` from master-plan.mdx deterministically, flips it to
# in-progress, and exports FORGE_TICKET_ID so the post-VERIFY hook can flip it
# to deployed. Requires tsx (repo devDependency).
if [ "$FEATURE" = "--next-ticket" ]; then
  TICKET_LINE=$( (cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/forge-next-ticket.mjs) ) || {
    rc=$?
    if [ "$rc" = "10" ]; then echo "No pending tickets in master-plan.mdx — nothing to do."; exit 0; fi
    echo "Failed to read master-plan.mdx (rc=$rc)"; exit 1
  }
  FORGE_TICKET_ID="${TICKET_LINE%%$'\t'*}"
  TICKET_HREF="${TICKET_LINE#*$'\t'}"
  export FORGE_TICKET_ID
  FEATURE="Execute master-plan ticket $FORGE_TICKET_ID${TICKET_HREF:+ (plan doc: $TICKET_HREF)}. Read the plan doc first; implement exactly that ticket."
  ( cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/master-plan-set-status.mjs "$FORGE_TICKET_ID" in-progress ) \
    || echo "⚠ could not flip $FORGE_TICKET_ID to in-progress (non-fatal)"
  echo "🎯 Picked ticket $FORGE_TICKET_ID"
fi

[ -z "$FEATURE" ] && { echo "Usage: forge.sh <feature request> | forge.sh --next-ticket"; exit 1; }

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

# ── Neon ephemeral branch sandbox (ALP-4.2..4.4 / ALP-6.2..6.4) ───────────────
# When FORGE_NEON_VERIFY=1 (+ NEON_API_KEY/NEON_PROJECT_ID configured), VERIFY
# runs against a fresh CoW branch of production, NEVER production itself:
# create → run with EVERY DB pool env pointed at the branch → success: delete ·
# failure: keep for retry. The mjs client hard-fails if the minted URL resolves
# to the production endpoint (incl. pooler aliases). Opportunistic TTL sweep of
# stale branches runs first so leaks self-heal even without a cron.
#
# SAFETY: values are parsed line-wise (never `eval`'d — a connection URI's `&`
# would background) and if the flag is on but a branch URL can't be minted, the
# VERIFY is SKIPPED, never silently run against prod.
BRANCH_ID=""
BRANCH_DATABASE_URL=""
NEON_VERIFY_ABORT=0
if [ "${FORGE_NEON_VERIFY:-0}" = "1" ] && [ -n "$VERIFY_CMD" ]; then
  ( cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/forge-verify-branch.mjs sweep ) || true
  if BRANCH_OUT=$( (cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/forge-verify-branch.mjs create "$RUN_UID") ); then
    BRANCH_ID=$(printf '%s\n' "$BRANCH_OUT"    | sed -n 's/^BRANCH_ID=//p'           | head -1)
    BRANCH_DATABASE_URL=$(printf '%s\n' "$BRANCH_OUT" | sed -n 's/^BRANCH_DATABASE_URL=//p' | head -1)
  fi
  if [ -z "$BRANCH_DATABASE_URL" ]; then
    echo "   ⛔ Neon verify branch unavailable — SKIPPING VERIFY (never runs on prod when the sandbox is requested)"
    _ingest runUid="$RUN_UID" stage=verify stageStatus=failed detail="neon branch unavailable; verify skipped" runStatus=error
    VERIFY_CMD=""
    NEON_VERIFY_ABORT=1
  else
    echo "   🌱 Neon verify branch: $BRANCH_ID"
  fi
fi

if [ -n "$VERIFY_CMD" ]; then
  echo "   → $VERIFY_CMD"
  # Point ALL Neon pools (src/lib/db.ts reads DATABASE_URL / TENANT_APP_DATABASE_URL
  # / ADMIN_DATABASE_URL) at the branch, and DENY the Control-Plane key to the
  # VERIFY subshell so a hostile `### VERIFY` line can't exfiltrate it.
  if ( cd "$REPO_ROOT" && \
       if [ -n "$BRANCH_DATABASE_URL" ]; then \
         env NEON_API_KEY= \
             DATABASE_URL="$BRANCH_DATABASE_URL" \
             DATABASE_URL_UNPOOLED="$BRANCH_DATABASE_URL" \
             TENANT_APP_DATABASE_URL="$BRANCH_DATABASE_URL" \
             ADMIN_DATABASE_URL="$BRANCH_DATABASE_URL" \
             bash -c "$VERIFY_CMD"; \
       else eval "$VERIFY_CMD"; fi ); then
    echo "   ✅ tests passed"
    _ingest runUid="$RUN_UID" stage=verify stageStatus=ok \
      detail="$VERIFY_CMD${BRANCH_ID:+ [neon-branch:$BRANCH_ID]}" runStatus=passed
    # Success → the ephemeral branch has served its purpose; delete it (ALP-4.4).
    if [ -n "$BRANCH_ID" ]; then
      ( cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/forge-verify-branch.mjs delete "$BRANCH_ID" ) \
        || echo "   ⚠ could not delete verify branch $BRANCH_ID (TTL sweep will catch it)"
    fi
    # ── Post-VERIFY master-plan hook (ALP-2.5) ─────────────────────────────
    # When this run was picked from a `<TicketStatus status="pending">` in
    # master-plan.mdx (Phase 4 outer loop exports FORGE_TICKET_ID), flip the
    # ticket to `deployed`. Best-effort like _ingest — NEVER aborts the run
    # (set -e is active). The sync daemon broadcasts the flip to /forge live.
    if [ -n "${FORGE_TICKET_ID:-}" ]; then
      RESOLUTION_COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "")
      ( cd "$REPO_ROOT" && npx tsx .cycle_forge_ops/scripts/master-plan-set-status.mjs \
          "$FORGE_TICKET_ID" deployed ${RESOLUTION_COMMIT:+"$RESOLUTION_COMMIT"} ) \
        || echo "   ⚠ master-plan status update failed (non-fatal)"
    fi
  else
    echo "   ❌ tests failed — inspect $MANIFEST"
    # Failure → KEEP the branch for retry (TTL sweep reclaims it later).
    [ -n "$BRANCH_ID" ] && echo "   🌱 verify branch kept for retry: $BRANCH_ID"
    _ingest runUid="$RUN_UID" stage=verify stageStatus=failed \
      detail="$VERIFY_CMD${BRANCH_ID:+ [neon-branch:$BRANCH_ID kept]}" runStatus=failed
  fi
elif [ "$NEON_VERIFY_ABORT" = "1" ]; then
  # The sandbox was requested but unavailable — already ingested runStatus=error
  # above. Do NOT re-record this as a passed/skipped run.
  echo "   ⛔ VERIFY not run (Neon sandbox unavailable) — run recorded as error."
else
  echo "   ⚠ no VERIFY command found in manifest; run targeted tests manually."
  _ingest runUid="$RUN_UID" stage=verify stageStatus=skipped detail="no VERIFY command in manifest" runStatus=passed
fi

echo ""
echo "🏁 Forge complete. Manifest: $MANIFEST"
