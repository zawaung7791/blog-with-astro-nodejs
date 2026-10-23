#!/usr/bin/env bash
# Back up the SQLite database to ./backups/blog-<timestamp>.db.gz and keep the
# newest $KEEP (default 14). Safe to run while the blog is up; run from cron.
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="${KEEP:-14}"
DEST="${BACKUP_DIR:-backups}"
mkdir -p "$DEST"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$DEST/blog-$stamp.db.gz"
tmp="$(mktemp "$DEST/.tmp.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

docker compose exec -T blog node scripts/dump.mjs | gzip -9 > "$tmp"

# Verify: non-empty and starts with the SQLite header.
if [ "$(gzip -dc "$tmp" | head -c 15)" != "SQLite format 3" ]; then
  echo "backup failed: output is not a SQLite database" >&2
  exit 1
fi
mv "$tmp" "$out"
chmod 600 "$out"
trap - EXIT
echo "wrote $out ($(du -h "$out" | cut -f1))"

# Prune old backups.
ls -1t "$DEST"/blog-*.db.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
