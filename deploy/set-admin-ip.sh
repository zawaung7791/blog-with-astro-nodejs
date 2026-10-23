#!/usr/bin/env bash
# Replace the /admin allowlist and reload nginx.
#   sudo deploy/set-admin-ip.sh 203.0.113.7
#   sudo deploy/set-admin-ip.sh 203.0.113.7 198.51.100.0/24 2001:db8::/48
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
[ $# -ge 1 ] || { echo "usage: $0 <ip-or-cidr> [...]" >&2; exit 1; }

target=/etc/nginx/snippets/blog-admin-allow.conf
tmp="$(mktemp)"
{
  echo "# IPs allowed to reach /admin/. Managed by deploy/set-admin-ip.sh."
  for addr in "$@"; do
    # Strict check: this value is written into an nginx config.
    if ! [[ "$addr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ || "$addr" =~ ^[0-9a-fA-F:]+(/[0-9]{1,3})?$ ]]; then
      echo "invalid address: $addr" >&2; exit 1
    fi
    echo "allow $addr;"
  done
  echo "deny all;"
} > "$tmp"

[ -f "$target" ] && cp "$target" "$target.bak"
install -m 644 "$tmp" "$target"
rm -f "$tmp"
if nginx -t; then
  systemctl reload nginx
  echo "allowlist updated:"; grep '^allow' "$target"
else
  [ -f "$target.bak" ] && cp "$target.bak" "$target"
  echo "nginx config test failed; previous allowlist restored" >&2
  exit 1
fi
