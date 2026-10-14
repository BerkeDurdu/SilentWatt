#!/usr/bin/env bash
# Daily database backup (PRD NFR-08): pg_dump of the local compose database, kept 14 days on the VM
# and copied to OBS. Cron on the VM:  15 3 * * *  /srv/silentwatt/app/deploy/scripts/backup-db.sh
# Needs obsutil configured once:  obsutil config -i=<AK> -k=<SK> -e=obs.<region>.myhuaweicloud.com
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir=/srv/silentwatt/backups
mkdir -p "$dir"
file="$dir/silentwatt-$stamp.sql.gz"
docker compose -f compose.cloud.yml --profile localdb exec -T db pg_dump -U silentwatt -d silentwatt --no-owner | gzip > "$file"
test -s "$file"
obsutil cp "$file" "obs://${OBS_BUCKET}/backups/" > /dev/null
find "$dir" -name 'silentwatt-*.sql.gz' -mtime +14 -delete
echo "backup written: $file → obs://${OBS_BUCKET}/backups/"
