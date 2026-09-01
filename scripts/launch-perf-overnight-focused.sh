#!/usr/bin/env bash
# Detached overnight launcher — do not pkill this script's argv for perf-overnight.mjs
set -euo pipefail
ROOT=/home/michaelgarisek/Projects/cycleforge-app
cd "$ROOT"
export PATH="${HOME}/.local/share/mise/shims:${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"
export LH_BASE_URL="${LH_BASE_URL:-http://127.0.0.1:3100}"

# Stop prior node overnight only (match node binary + script path)
if [[ -f .cursor/perf-overnight.pid ]]; then
  old=$(cat .cursor/perf-overnight.pid || true)
  if [[ -n "${old}" ]] && kill -0 "$old" 2>/dev/null; then
    kill "$old" 2>/dev/null || true
    sleep 1
  fi
fi

export LH_COOKIE
LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
ROUTES=/unbox,/test,/pack,/search,/triage,/settings,/settings/integrations

echo "[launch $(date -Iseconds)] in-place routes=$ROUTES cookie_len=${#LH_COOKIE}" >> .cursor/perf-overnight.log

node tools/eval-ledger/perf-overnight.mjs \
  --in-place \
  --routes "$ROUTES" \
  --max-hours 12 \
  --max-rounds 48 \
  --hops 3 \
  >> .cursor/perf-overnight.log 2>&1 &
echo $! > .cursor/perf-overnight.pid
echo "STARTED $(cat .cursor/perf-overnight.pid)"
