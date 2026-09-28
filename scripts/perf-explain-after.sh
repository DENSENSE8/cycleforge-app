#!/usr/bin/env bash
# AFTER half of docs/refactors/sidebar/perf-explain.
#
# For every <name>.after.sql it runs EXPLAIN exactly as the app's tenant reads
# run (withTenantConnection / tenantQueryOneTrip): logged in as the runtime role
# (TENANT_APP_DATABASE_URL = app_tenant, no BYPASSRLS, so every FORCE'd table's
# tenant_isolation policy is in the plan) on the UNPOOLED compute, inside a
# read-only transaction with a transaction-local org GUC:
#   BEGIN READ ONLY;
#   SELECT set_config('app.current_org', '<org>', true);
#   EXPLAIN (ANALYZE, BUFFERS) <sql>;
#   ROLLBACK;
# and writes <name>.after.txt next to <name>.before.txt, then prints a
# before/after Execution Time table. Nothing is written to the database and no
# session-level SET is issued (a session SET through the pooler once put the
# lane read-only).
#
# The run aborts if the login role bypasses RLS: an owner plan skips the
# policies and misreports the app's cost. There is no owner fallback — on Neon
# neondb_owner may not SET ROLE app_tenant ("permission denied to set role").
#
# Code-built fixtures (orders_list_*) are re-rendered from the current builders
# by scripts/perf-explain-render.ts; run it first.
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

role="$(psql "$UNPOOLED" -X -q -t -A -v ON_ERROR_STOP=1 \
  -c "SELECT current_user || ' bypassrls=' || rolbypassrls FROM pg_roles WHERE rolname = current_user")"
if [[ "$role" != *"bypassrls=false" ]]; then
  echo "refusing to explain as '$role': the role bypasses RLS, so its plans skip the tenant policies" >&2
  exit 2
fi

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
    echo "-- captured $(date -u +%Y-%m-%dT%H:%M:%SZ) as $role (unpooled), app.current_org=$ORG"
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
