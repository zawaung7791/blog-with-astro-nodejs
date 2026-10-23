# Blog

A personal blog built with [Astro](https://astro.build), served at
<https://blog.zawaung.site>.

- Posts are Markdown files in `src/content/posts/`, prerendered to static HTML.
  nginx serves them directly from `dist/client/`.
- [Pagefind](https://pagefind.app) provides client-side search.
- A small Node server (`@astrojs/node`, standalone) handles only the dynamic
  parts, in a Docker container: moderated comments, a contact form, and a
  moderation page. Data lives in SQLite (`better-sqlite3`) on a Docker volume.
- Keystatic is the post editor. It runs **only on a dev machine** (`npm run dev`)
  and is not part of the production build.

```
browser ──► nginx ──┬─ /            static files from dist/client/
                    ├─ /api/        ─► container 127.0.0.1:4321 (comments, contact)
                    └─ /admin/      ─► container (basic auth + IP allowlist)
```

For the reasoning behind each decision, how the code works, and day-to-day
operation, see [docs/GUIDE.md](docs/GUIDE.md).

## Development

Requires Node 22.23.4 or newer.

```sh
npm install
npm run dev        # http://localhost:4321, with the Keystatic editor at /keystatic
npm run build      # astro build, then the Pagefind index → dist/client + dist/server
```

Search is only available after a build (`npm run dev` has no index).

To run the API against a local database after a build:

```sh
ALLOW_LOCALHOST=1 DB_PATH=./data/blog.db HOST=127.0.0.1 PORT=4321 node dist/server/entry.mjs
```

See `.env.example` for the settings (`DB_PATH`, `SITE_ORIGIN`, …).

### Writing a post

Use the Keystatic editor at <http://localhost:4321/keystatic> while `npm run dev`
is running, or add `src/content/posts/my-post.md` by hand:

```md
---
title: My post
description: One-line summary.
pubDate: 2026-10-23
tags: [example]
---

Content here.
```

Set `draft: true` to keep a post out of the build. Commit, push, then deploy
(see [Update](#update)).

## Comments, contact form and moderation

- `GET /api/comments?post=<id>` returns **approved** comments only.
- `POST /api/comments` stores a comment as `pending`; it stays hidden until approved.
- `POST /api/contact` stores a message. Nothing is emailed.
- `/admin/` lists pending comments and contact messages, with approve, reject and delete.

Spam protection: a hidden `website` honeypot field (if filled, the request is
silently dropped), and a per-IP fixed-window rate limit kept in SQLite (comments
10/hour, contact 3/hour; every request counts). IPs are stored only as a salted
hash. The API also checks the `Origin` header, requires JSON, and caps body size.

The app trusts the `X-Real-IP` header, which nginx **overwrites** with the real
peer address. That is why the container port is published on `127.0.0.1` only.
Never publish it on `0.0.0.0`.

## Deployment

### First-time setup

1. **DNS:** an A record for `blog.zawaung.site` pointing at the server.
2. **nginx and HTTPS:**
   ```sh
   sudo cp deploy/nginx/blog.zawaung.site.conf /etc/nginx/sites-available/blog.zawaung.site
   sudo ln -s /etc/nginx/sites-available/blog.zawaung.site /etc/nginx/sites-enabled/
   ```
   The file in the repo is the final result, including the lines certbot adds. On
   a brand-new server, temporarily delete the `listen ... ssl`, `ssl_*` and
   `include .../options-ssl-nginx.conf` lines and the second (port 80) `server`
   block, reload nginx, run `sudo certbot --nginx -d blog.zawaung.site`, and let
   certbot put them back. (On this server it is already installed and certified.)
3. **nginx must be able to read `dist/client`.** If the site lives in a home
   directory (mode 750), grant traverse access:
   `sudo apt install acl && sudo setfacl -m u:www-data:x /home/zawaung`.
4. **Admin protection** (nginx uses two checks together: basic auth and an IP allowlist):
   ```sh
   # password file; you are prompted for the password
   printf 'admin:%s\n' "$(openssl passwd -apr1)" | sudo tee /etc/nginx/blog.htpasswd
   sudo chmod 640 /etc/nginx/blog.htpasswd && sudo chgrp www-data /etc/nginx/blog.htpasswd
   # allowlist (your public IP)
   sudo deploy/set-admin-ip.sh 203.0.113.7
   ```
5. **Build and start:** `scripts/deploy.sh`, then `sudo nginx -t && sudo systemctl reload nginx`.
6. **Backups:** add a daily cron job (`crontab -e`):
   ```
   15 3 * * * /home/zawaung/blog/scripts/backup.sh >> /home/zawaung/blog/backups/backup.log 2>&1
   ```
   Copy `backups/` off the machine too; a backup on the same disk is not a backup.

### Changing your IP address

`/admin/` is only reachable from allowlisted IPs. If your connection gets a new
address you will see **403 Forbidden** on `/admin/`; the public site, comments and
the contact form are unaffected. SSH into the server (SSH is separate from this
allowlist) and run:

```sh
sudo deploy/set-admin-ip.sh <new-ip> [<another-ip-or-cidr> ...]
```

It validates the addresses, rewrites `/etc/nginx/snippets/blog-admin-allow.conf`,
tests the config and reloads nginx (restoring the old list if the test fails).
You can allow several addresses or a CIDR range at once. The live list is kept
only on the server; `deploy/nginx/blog-admin-allow.conf` in the repo holds a
placeholder address so your real IP is never published.

### Docker image

`Dockerfile` is multi-stage on a pinned base (`node:22.23.4-slim` plus its
digest):

| stage       | purpose                                                              |
|-------------|----------------------------------------------------------------------|
| `build`     | `npm ci`, `npm run build` (site + Pagefind index)                    |
| `prod-deps` | `npm ci --omit=dev` (dependencies for the runtime image only)        |
| `client`    | `FROM scratch`, holds just `dist/client` so it can be exported       |
| `runtime`   | the Node API server; runs as the unprivileged `node` user (uid 1000) |

`docker-compose.yml` runs it with a read-only root filesystem, `/tmp` as tmpfs,
all capabilities dropped, `no-new-privileges`, and the named volume `blog-data`
mounted at `/data` (the only writable path, holding `blog.db`).

To change the base image: `docker pull node:22-slim`, then update the tag and
digest in `ARG NODE_IMAGE` at the top of the `Dockerfile`.

## Rebuild

Rebuilds the site and the container from the current checkout:

```sh
scripts/deploy.sh
```

This exports the static site from Docker into `dist/client` (swapping the old one
in place) and rebuilds and restarts the container. The database volume is not
touched. After a change to the nginx config, also run
`sudo nginx -t && sudo systemctl reload nginx`.

## Update

**Content or code:**

```sh
git pull
scripts/deploy.sh
```

**Dependencies:**

```sh
npm update                # or: npm install <pkg>@latest
npm audit                 # fix anything it reports
npm run build             # check it still builds
git add package.json package-lock.json && git commit
scripts/deploy.sh
```

`package-lock.json` is committed and the image installs with `npm ci`, so builds
use exactly the locked versions. Also re-pull the base image occasionally (see
above) to pick up Debian and Node security patches.

## Backup

```sh
scripts/backup.sh
```

Writes a consistent snapshot (taken through SQLite, safe while the blog is
running) to `backups/blog-<UTC timestamp>.db.gz`, checks that it is a SQLite
file, and keeps the newest 14 (`KEEP=30 scripts/backup.sh` to change).

## Restore

```sh
scripts/restore.sh backups/blog-20261023T030000Z.db.gz
```

It asks for confirmation, stops the container, writes the backup into the
volume, and starts the container again. The database it replaces is kept as
`blog.db.before-restore` in the volume.

**Rebuilding on a new server:** clone the repo, do the first-time setup above,
run `scripts/deploy.sh` (this creates the data volume), then
`scripts/restore.sh` with your latest off-machine backup.

## Layout

```
src/content/posts/      Markdown posts
src/pages/              site pages; api/ and admin/ are server-rendered
src/lib/                SQLite access, rate limiting, request validation
keystatic.config.ts     editor schema (dev only)
Dockerfile, docker-compose.yml
scripts/                deploy.sh, backup.sh, restore.sh, dump.mjs
deploy/nginx/           nginx server block and /admin allowlist
```

## License

[MIT](LICENSE)
