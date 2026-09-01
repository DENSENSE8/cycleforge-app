#!/usr/bin/env bash
# Deterministic stdin tests for stop-eval-gate.sh — no MLX, no verify:fast.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.cursor/hooks/stop-eval-gate.sh"
PASS=0
FAIL=0

assert_eq() {
  local name="$1" got="$2" want="$3"
  local got_n want_n
  got_n="$(printf '%s' "$got" | tr -d '[:space:]')"
  want_n="$(printf '%s' "$want" | tr -d '[:space:]')"
  if [ "$got_n" = "$want_n" ]; then
    echo "ok  - $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL - $name"
    echo "  got:  [$got]"
    echo "  want: [$want]"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" got="$2" needle="$3"
  if printf '%s' "$got" | grep -Fq "$needle"; then
    echo "ok  - $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL - $name (missing: $needle)"
    echo "  got: [$got]"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local name="$1" got="$2" needle="$3"
  if printf '%s' "$got" | grep -Fq "$needle"; then
    echo "FAIL - $name (unexpected: $needle)"
    echo "  got: [$got]"
    FAIL=$((FAIL + 1))
  else
    echo "ok  - $name"
    PASS=$((PASS + 1))
  fi
}

# Capture stdout only; stderr goes to Hooks channel in production.
run_hook() {
  local stdin="$1"
  printf '%s' "$stdin" | "$HOOK" 2>/dev/null
}

# 1) aborted → {}
got="$(run_hook '{"status":"aborted","loop_count":0}')"
assert_eq "status=aborted → {}" "$got" "{}"

# 2) loop_count=1 → {}
got="$(run_hook '{"status":"completed","loop_count":1}')"
assert_eq "loop_count=1 → {}" "$got" "{}"

# 3) kill switch
got="$(CYCLEFORGE_EVAL_STOP=0 run_hook '{"status":"completed","loop_count":0}')"
assert_eq "CYCLEFORGE_EVAL_STOP=0 → {}" "$got" "{}"

# 4) dry fail → followup_message, never "All checks passed"
got="$(CYCLEFORGE_EVAL_STOP=dry run_hook '{"status":"completed","loop_count":0}')"
assert_contains "dry fail has followup_message" "$got" '"followup_message"'
assert_contains "dry fail names stamp" "$got" "eval-session.json"
assert_not_contains "dry fail never All checks passed" "$got" "All checks passed"
assert_contains "dry fail forbids paint" "$got" "Do not change paint"

# 5) malformed stdin → {}
got="$(printf 'not-json{{{' | "$HOOK" 2>/dev/null || true)"
assert_eq "malformed stdin → {}" "$got" "{}"

# 6) error status → {}
got="$(run_hook '{"status":"error","loop_count":0}')"
assert_eq "status=error → {}" "$got" "{}"

# 7) timeout path → {} (fail open — never a followup for hung verify)
got="$(CYCLEFORGE_EVAL_STOP=timeout run_hook '{"status":"completed","loop_count":0}')"
assert_eq "CYCLEFORGE_EVAL_STOP=timeout → {}" "$got" "{}"
assert_not_contains "timeout never followup_message" "$got" "followup_message"

echo
echo "passed=$PASS failed=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
