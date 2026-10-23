#!/usr/bin/env bash
# Restore the database from a backup made by scripts/backup.sh.
#   scripts/restore.sh backups/blog-20261023T120000Z.db.gz
# Stops the blog, replaces the database file in the volume, starts it again.
# The current database is kept as blog.db.before-restore in the volume.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:?usage: $0 <backup .db.gz>}"
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
if [ "$(gzip -dc "$file" | head -c 15)" != "SQLite format 3" ]; then
  echo "not a SQLite backup: $file" >&2
  exit 1
fi

read -r -p "Replace the live database with $file? [y/N] " ok
[ "$ok" = "y" ] || { echo "aborted"; exit 1; }

vol="$(docker compose config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); print(c["name"] + "_blog-data")')"
image="$(grep -m1 'ARG NODE_IMAGE=' Dockerfile | cut -d= -f2-)"

docker compose stop blog
# Stream the backup in over stdin (no bind mount, so file ownership on the host
# doesn't matter). Write the new file first and only then swap, so a failure
# leaves the existing database untouched.
gzip -dc "$file" | docker run --rm -i --user node -v "$vol":/data "$image" sh -c '
  set -e
  cat > /data/blog.db.restoring
  [ -s /data/blog.db.restoring ]
  if [ -f /data/blog.db ]; then mv /data/blog.db /data/blog.db.before-restore; fi
  rm -f /data/blog.db-wal /data/blog.db-shm
  mv /data/blog.db.restoring /data/blog.db
'
docker compose start blog
echo "restored from $file"
