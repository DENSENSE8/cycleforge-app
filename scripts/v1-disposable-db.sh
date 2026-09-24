#!/usr/bin/env bash
# Disposable local PostgreSQL for the V1 label-ingestion database gates
# (`pnpm verify:v1:schema`, `pnpm test:v1:data`).
#
# Idempotent. Starts (or reuses) a throwaway container bound to 127.0.0.1,
# builds `cycleforge_v1_test` from a READ-ONLY schema-only dump of the Neon
# database in .env, mirrors the Neon role shape, and prints the V1_TEST_*
# exports on stdout (all diagnostics go to stderr):
#
#   eval "$(scripts/v1-disposable-db.sh)"            # reuse existing schema
#   eval "$(scripts/v1-disposable-db.sh --rebuild)"  # drop + re-dump + restore
#   pnpm verify:v1:schema && pnpm test:v1:data
#
# Role shape (mirrors Neon):
#   cycleforge_v1_owner   LOGIN, NOSUPERUSER, BYPASSRLS — owns every restored
#                         object, like neondb_owner.
#   app_tenant            NOLOGIN, NOBYPASSRLS — DML on all public tables and
#                         USAGE on sequences, like the Neon app_tenant role.
#   cycleforge_v1_tenant  LOGIN, NOBYPASSRLS, non-owner member of app_tenant.
#   hermes_agent          NOLOGIN stub referenced by dumped RLS policies.
#
# The only secret involved in the gates is the local throwaway password, which
# lives in the container's POSTGRES_PASSWORD. The Neon DSN is used solely for
# `pg_dump` under default_transaction_read_only and is never printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${V1_DB_CONTAINER:-cf-v1-disposable}"
PORT="${V1_DB_PORT:-55432}"
# Neon runs PostgreSQL 17 with pgvector; the plain postgres image lacks `vector`.
IMAGE="${V1_DB_IMAGE:-pgvector/pgvector:pg17}"
DB=cycleforge_v1_test
OWNER=cycleforge_v1_owner
TENANT=cycleforge_v1_tenant
REBUILD=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD=1

log() { printf 'v1-disposable-db: %s\n' "$*" >&2; }

case "$CONTAINER$DB" in
  *prod*) log "refusing a production-looking container/database name"; exit 1 ;;
esac

# 1. Container ---------------------------------------------------------------
if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  log "starting container $CONTAINER ($IMAGE) on 127.0.0.1:$PORT"
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
    -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null
elif [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
  log "starting stopped container $CONTAINER"
  docker start "$CONTAINER" >/dev/null
fi

PW="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" \
  | sed -n 's/^POSTGRES_PASSWORD=//p')"
[[ -n "$PW" ]] || { log "container $CONTAINER has no POSTGRES_PASSWORD"; exit 1; }

SUPER_BASE="postgresql://postgres:$PW@127.0.0.1:$PORT"
for _ in $(seq 60); do
  psql "$SUPER_BASE/postgres" -qAtc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql "$SUPER_BASE/postgres" -qAtc 'SELECT 1' >/dev/null

super() { psql "$SUPER_BASE/$1" -X -q -v ON_ERROR_STOP=1 -v pw="$PW" "${@:2}"; }

# 2. Cluster roles -----------------------------------------------------------
super postgres >/dev/null <<SQL
SET client_min_messages = warning;
SELECT format('CREATE ROLE %I NOLOGIN', r)
  FROM unnest(ARRAY['app_tenant', 'hermes_agent', '$OWNER', '$TENANT']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
ALTER ROLE app_tenant   NOLOGIN NOSUPERUSER NOBYPASSRLS INHERIT;
ALTER ROLE hermes_agent NOLOGIN NOSUPERUSER NOBYPASSRLS;
SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS PASSWORD %L', '$OWNER', :'pw') \gexec
SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS INHERIT PASSWORD %L', '$TENANT', :'pw') \gexec
GRANT app_tenant TO $TENANT;
SQL

# 3. Database + schema -------------------------------------------------------
if (( REBUILD )); then
  log "dropping $DB for rebuild"
  super postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null
fi

if [[ -z "$(super postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$DB'")" ]]; then
  SOURCE_URL="${V1_SCHEMA_SOURCE_URL:-}"
  if [[ -z "$SOURCE_URL" ]]; then
    SOURCE_URL="$(grep -m1 '^DATABASE_URL_UNPOOLED=' "$ROOT/.env" | cut -d= -f2- \
      | sed -e "s/^[\"']//" -e "s/[\"']\$//")"
  fi
  [[ -n "$SOURCE_URL" ]] || { log "no DATABASE_URL_UNPOOLED in .env to dump the schema from"; exit 1; }

  log "creating $DB owned by $OWNER"
  super postgres -c "CREATE DATABASE $DB OWNER $OWNER" >/dev/null
  trap 'log "restore failed; dropping half-built $DB"; super postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null' ERR

  # Extensions are superuser-owned (as on Neon). pg_session_jwt is Neon-only
  # and unreferenced by the application schema, so it is skipped.
  super "$DB" -c 'CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
                  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
                  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
                  CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;' >/dev/null

  log "dumping schema (read-only) and restoring as $OWNER"
  PGOPTIONS='-c default_transaction_read_only=on' \
    pg_dump --schema-only --no-owner --no-privileges "$SOURCE_URL" \
    | sed -e '/^CREATE EXTENSION IF NOT EXISTS pg_session_jwt /d' \
          -e '/^COMMENT ON EXTENSION /d' \
    | psql "postgresql://$OWNER:$PW@127.0.0.1:$PORT/$DB" -X -q -v ON_ERROR_STOP=1 >/dev/null
  trap - ERR
fi

# 4. Tenant-role grants (mirror Neon app_tenant: DML on tables, USAGE on sequences)
psql "postgresql://$OWNER:$PW@127.0.0.1:$PORT/$DB" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_tenant;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
ALTER DEFAULT PRIVILEGES FOR ROLE $OWNER IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO app_tenant;
SQL

log "ready: $DB on 127.0.0.1:$PORT (container $CONTAINER)"

# 5. Exports (stdout) ---------------------------------------------------------
cat <<EOF
export V1_TEST_DATABASE_URL='postgresql://$OWNER:$PW@127.0.0.1:$PORT/$DB'
export V1_TEST_TENANT_DATABASE_URL='postgresql://$TENANT:$PW@127.0.0.1:$PORT/$DB'
export V1_TEST_DATABASE_KIND=disposable
export V1_TEST_DATABASE_CONFIRM=APPLY_V1_MIGRATION
EOF
