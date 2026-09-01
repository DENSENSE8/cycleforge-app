#!/usr/bin/env bash
# Launch overnight Lighthouse-95 grind on the local Hermes coder.
# Host loop: tools/eval-ledger/perf-overnight.mjs
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.npm-global/bin:${HOME}/.local/share/mise/shims:${PATH}"
export LH_BASE_URL="${LH_BASE_URL:-http://127.0.0.1:3100}"
export PERF_OVERNIGHT_MAX_HOURS="${PERF_OVERNIGHT_MAX_HOURS:-12}"
export PERF_OVERNIGHT_MAX_ROUNDS="${PERF_OVERNIGHT_MAX_ROUNDS:-48}"

mkdir -p .cursor
LOG=".cursor/perf-overnight.log"

if ! curl -sf -o /dev/null --max-time 2 "$LH_BASE_URL/" && ! curl -sf -o /dev/null --max-time 2 "$LH_BASE_URL/signin"; then
  echo "No server at $LH_BASE_URL — start prod build first:" >&2
  echo "  NEXT_DIST_DIR=.next-perf pnpm build" >&2
  echo "  AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100" >&2
  exit 2
fi

if [ -z "${LH_COOKIE:-}" ]; then
  echo "Minting LH_COOKIE…"
  export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
fi

echo "Starting overnight grind → $LOG (max ${PERF_OVERNIGHT_MAX_HOURS}h)"
exec node tools/eval-ledger/perf-overnight.mjs \
  --max-hours "$PERF_OVERNIGHT_MAX_HOURS" \
  --max-rounds "${PERF_OVERNIGHT_MAX_ROUNDS}" \
  "$@" >>"$LOG" 2>&1
