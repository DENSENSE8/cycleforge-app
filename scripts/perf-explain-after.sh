#!/usr/bin/env bash
# AFTER half of docs/refactors/sidebar/perf-explain: run once the
# 2026-09-26_perf_* migrations are applied.
#
# For every <name>.after.sql it runs, as app_tenant on the UNPOOLED compute
# (TENANT_APP_DATABASE_URL minus "-pooler") inside a read-only transaction with
# a transaction-local org GUC:
#   BEGIN READ ONLY;
#   SELECT set_config('app.current_org', '<org>', true);
#   EXPLAIN (ANALYZE, BUFFERS) <sql>;
#   ROLLBACK;
# and writes <name>.after.txt next to <name>.before.txt, then prints a
# before/after Execution Time table. Nothing is written to the database and no
# session-level SET is issued (a session SET through the pooler once put the
# lane read-only).
#
# Usage: scripts/perf-explain-after.sh [org-uuid]   (default: the usav org)
set -euo pipefail

cd "$(dirname "$0")/.."
DIR=docs/refactors/sidebar/perf-explain
ORG="${1:-00000000-0000-0000-0000-000000000001}"

if [[ ! "$ORG" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo "org must be a uuid: $ORG" >&2
  exit 2
fi

TENANT_URL="${TENANT_APP_DATABASE_URL:-}"
if [[ -z "$TENANT_URL" ]]; then
  TENANT_URL="$(grep -E '^TENANT_APP_DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
if [[ -z "$TENANT_URL" ]]; then
  echo "TENANT_APP_DATABASE_URL is not set (env or .env)" >&2
  exit 2
fi
UNPOOLED="${TENANT_URL/-pooler./.}"

shopt -s nullglob
files=("$DIR"/*.after.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no $DIR/*.after.sql files" >&2
  exit 2
fi

status=0
printf '%-44s %12s %12s\n' "query" "before ms" "after ms"
for sql_file in "${files[@]}"; do
  name="$(basename "$sql_file" .after.sql)"
  out="$DIR/$name.after.txt"
  {
    echo "-- $name: AFTER"
    echo "-- captured $(date -u +%Y-%m-%dT%H:%M:%SZ) as app_tenant (unpooled), app.current_org=$ORG"
    echo "-- SQL: $sql_file"
    echo
  } > "$out"
  if ! {
    echo "BEGIN READ ONLY;"
    echo "SELECT set_config('app.current_org', '$ORG', true) \\g /dev/null"
    printf 'EXPLAIN (ANALYZE, BUFFERS) '
    cat "$sql_file"
    echo ";"
    echo "ROLLBACK;"
  } | psql "$UNPOOLED" -X -q -v ON_ERROR_STOP=1 -P pager=off -f - >> "$out" 2>&1; then
    status=1
  fi
  before="$(grep -Eo 'Execution Time: [0-9.]+' "$DIR/$name.before.txt" 2>/dev/null | awk '{print $3}' | tail -n 1)"
  after="$(grep -Eo 'Execution Time: [0-9.]+' "$out" | awk '{print $3}' | tail -n 1)"
  printf '%-44s %12s %12s\n' "$name" "${before:--}" "${after:-ERROR}"
done
exit "$status"
