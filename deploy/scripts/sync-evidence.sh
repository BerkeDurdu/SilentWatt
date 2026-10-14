#!/usr/bin/env bash
# Pulls a detector run from OBS and restarts the console on it. The console reads the evidence once at
# start and refuses a run whose schema or dates break the contract, so a bad run never goes live.
#   deploy/scripts/sync-evidence.sh <run-id>      e.g. detect-2026-10-15
# Detector runs are uploaded to obs://<bucket>/evidence/<run-id>/ (index.json + cases/).
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
run=${1:?usage: sync-evidence.sh <run-id>}
target=${SILENTWATT_EVIDENCE_HOST_DIR:-/srv/silentwatt/evidence}
staging="$target.incoming"
rm -rf "$staging" && mkdir -p "$staging"
obsutil sync "obs://${OBS_BUCKET}/evidence/${run}/" "$staging" > /dev/null
test -f "$staging/index.json" || { echo "no index.json in obs://${OBS_BUCKET}/evidence/${run}/" >&2; exit 1; }
rm -rf "$target.previous"
if [ -d "$target" ]; then mv "$target" "$target.previous"; fi
mv "$staging" "$target"
docker compose -f compose.cloud.yml restart console
sleep 5
if ! docker compose -f compose.cloud.yml exec -T console wget -qO- http://127.0.0.1:3001/api/health; then
  echo "console did not start on run ${run}; going back to the previous evidence" >&2
  rm -rf "$target" && mv "$target.previous" "$target"
  docker compose -f compose.cloud.yml restart console
  exit 1
fi
echo
echo "console now serves run ${run}"
