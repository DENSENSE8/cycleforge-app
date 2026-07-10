#!/bin/bash
# Store the Cycle Forge keys into Hermes' managed env (the keys SoT).
# Reads the canonical values from the app's .env.local so both sides agree.
set -e
HERMES=/home/avion/.local/bin/hermes
ENVLOCAL=/mnt/e/USAV-Orders-Backend/.env.local

TOKEN=$(grep '^FORGE_INGEST_TOKEN=' "$ENVLOCAL" | cut -d= -f2)
EP=$("$HERMES" config env-path)
echo "hermes env-path: $EP"
touch "$EP"

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$EP"; then
    sed -i "s#^${key}=.*#${key}=${val}#" "$EP"
  else
    echo "${key}=${val}" >> "$EP"
  fi
}

upsert FORGE_INGEST_TOKEN "$TOKEN"
upsert FORGE_ORG_ID "00000000-0000-0000-0000-000000000001"
upsert FORGE_INGEST_URL "http://localhost:3002/api/forge/ingest"

# Dev DB keys (local Docker cycleforge via wsproxy) — Hermes is SoT for these too.
DBURL=$(grep '^DATABASE_URL=' "$ENVLOCAL" | cut -d= -f2-)
[ -n "$DBURL" ] && upsert DATABASE_URL "$DBURL"
upsert NEON_WSPROXY "localhost:5488"

echo "forge keys now in Hermes SoT:"
grep -oE '^FORGE_[A-Z_]+=' "$EP" | sed 's/=//'
STORED=$(grep '^FORGE_INGEST_TOKEN=' "$EP" | cut -d= -f2)
if [ "$STORED" = "$TOKEN" ] && [ -n "$TOKEN" ]; then
  echo "RESULT: token stored + matches .env.local (len ${#TOKEN})"
else
  echo "RESULT: MISMATCH (stored len ${#STORED}, source len ${#TOKEN})"
fi
