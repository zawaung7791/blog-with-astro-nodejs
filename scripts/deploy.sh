#!/usr/bin/env bash
# Rebuild and deploy: exports the static site to dist/client (served by nginx)
# and rebuilds/restarts the API container. Run after `git pull` or editing posts.
set -euo pipefail
cd "$(dirname "$0")/.."

out="$(mktemp -d dist.new.XXXXXX)"
trap 'rm -rf "$out"' EXIT

docker build --target client --output "type=local,dest=$out" .
chmod -R a+rX "$out"

mkdir -p dist
rm -rf dist/client.old
[ -d dist/client ] && mv dist/client dist/client.old
mv "$out" dist/client
rm -rf dist/client.old
trap - EXIT

docker compose up -d --build
echo "deployed"
