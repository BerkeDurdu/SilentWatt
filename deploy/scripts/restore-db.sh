#!/usr/bin/env bash
# Restores a backup into the local compose database:  deploy/scripts/restore-db.sh <file.sql.gz | obs://…>
# The console is stopped while the database is replaced, then started again.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
src=${1:?usage: restore-db.sh <backup.sql.gz or obs://bucket/backups/file.sql.gz>}
if [[ $src == obs://* ]]; then
  obsutil cp "$src" /tmp/silentwatt-restore.sql.gz > /dev/null
  src=/tmp/silentwatt-restore.sql.gz
fi
compose="docker compose -f compose.cloud.yml --profile localdb"
$compose stop console
$compose exec -T db psql -U silentwatt -d silentwatt -c 'DROP TABLE IF EXISTS console_state'
gunzip -c "$src" | $compose exec -T db psql -U silentwatt -d silentwatt -v ON_ERROR_STOP=1 > /dev/null
$compose start console
echo "restored from $1"
