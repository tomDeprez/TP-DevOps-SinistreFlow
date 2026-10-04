#!/usr/bin/env bash
# OUTIL PROF — reconstruit sinistreflow/db/dump/sinistreflow_prod_2026-09-28.sql
# Prérequis : Docker, Node.js. Usage : bash prof/tools/build-dump.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/sinistreflow"
OUT="$APP/db/dump/sinistreflow_prod_2026-09-28.sql"
NAME=sf-dump-builder

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_USER=sinistreflow -e POSTGRES_PASSWORD=build -e POSTGRES_DB=sinistreflow postgres:16 >/dev/null
until docker exec "$NAME" pg_isready -U sinistreflow -d sinistreflow >/dev/null 2>&1; do sleep 1; done
sleep 2

psql_exec() { docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U sinistreflow -d sinistreflow; }

echo "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());" | psql_exec
for v in 1 2 3 4 5 6 7 8 9; do
  f=$(ls "$APP/migrations" | grep -E "^${v}_.*\.sql$")
  echo "→ $f"
  psql_exec < "$APP/migrations/$f"
done

(cd "$ROOT" && node prof/tools/generate-dump-data.js) > "$ROOT/prof/tools/.data.sql"
psql_exec < "$ROOT/prof/tools/.data.sql"
rm -f "$ROOT/prof/tools/.data.sql"

{
  echo "--"
  echo "-- MutuAlp Assurances - SinistreFlow"
  echo "-- Export de la base de PRODUCTION (données anonymisées RGPD) du 28/09/2026 02:00"
  echo "-- Restauration : voir db/README.md"
  echo "--"
  # les lignes \restrict / \unrestrict (pg_dump récents) cassent les psql plus anciens
  docker exec "$NAME" pg_dump -U sinistreflow -d sinistreflow --no-owner --no-privileges | grep -v -e '^\\restrict ' -e '^\\unrestrict '
} > "$OUT"

docker rm -f "$NAME" >/dev/null
echo "Dump écrit : $OUT ($(wc -l < "$OUT") lignes)"
