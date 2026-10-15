#!/usr/bin/env bash
# Restores a backup into the local compose database:  deploy/scripts/restore-db.sh <file.sql.gz.enc | obs://…>
# Encrypted backups (.enc) are opened with BACKUP_PASSPHRASE from .env.
# The console is stopped while the database is replaced, then started again.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
src=${1:?usage: restore-db.sh <backup.sql.gz.enc or obs://bucket/backups/file.sql.gz.enc>}
umask 077
if [[ $src == obs://* ]]; then
  local_copy=/tmp/silentwatt-restore.$(basename "$src")
  obsutil cp "$src" "$local_copy" > /dev/null
  src=$local_copy
fi
if [[ $src == *.enc ]]; then
  : "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in deploy/.env}"
  export BACKUP_PASSPHRASE
  unpack() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$src" | gunzip -c; }
else
  unpack() { gunzip -c "$src"; }
fi
compose="docker compose -f compose.cloud.yml --profile localdb"
$compose stop console
$compose exec -T db psql -U silentwatt -d silentwatt -c 'DROP TABLE IF EXISTS console_state'
unpack | $compose exec -T db psql -U silentwatt -d silentwatt -v ON_ERROR_STOP=1 > /dev/null
$compose start console
echo "restored from $1"
