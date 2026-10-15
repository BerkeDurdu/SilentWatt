#!/usr/bin/env bash
# Daily database backup (PRD NFR-08): pg_dump of the local compose database, kept 14 days on the VM
# and copied to OBS. Cron on the VM:  15 3 * * *  /srv/silentwatt/app/deploy/scripts/backup-db.sh
# The dump holds residents' names, phones and addresses, so it is encrypted (AES-256, BACKUP_PASSPHRASE
# in .env) before it touches the disk; keep the passphrase somewhere other than the VM.
# Needs obsutil configured once:  obsutil config -i=<AK> -k=<SK> -e=obs.<region>.myhuaweicloud.com
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in deploy/.env}"
export BACKUP_PASSPHRASE
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/srv/silentwatt/backups
mkdir -p "$dir"
file="$dir/silentwatt-$stamp.sql.gz.enc"
docker compose -f compose.cloud.yml --profile localdb exec -T db pg_dump -U silentwatt -d silentwatt --no-owner \
  | gzip | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE > "$file"
test -s "$file"
obsutil cp "$file" "obs://${OBS_BUCKET}/backups/" > /dev/null
find "$dir" -name 'silentwatt-*.sql.gz*' -mtime +14 -delete
echo "backup written: $file → obs://${OBS_BUCKET}/backups/"
