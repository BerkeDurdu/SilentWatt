#!/usr/bin/env bash
# Builds the console image and pushes it to Huawei Cloud SWR.
#   SWR_REGION=tr-west-1 SWR_ORG=silentwatt deploy/scripts/push-image.sh
# Log in first with the long-term login command from the SWR console ("Generate Login Command").
set -euo pipefail
cd "$(dirname "$0")/../.."
region=${SWR_REGION:?set SWR_REGION, e.g. tr-west-1}
org=${SWR_ORG:?set SWR_ORG, the SWR organization}
tag=${TAG:-$(git rev-parse --short HEAD)}
image="swr.${region}.myhuaweicloud.com/${org}/console:${tag}"
docker build -t "$image" .
docker push "$image"
echo "pushed $image — set SILENTWATT_IMAGE=$image in deploy/.env on the server"
