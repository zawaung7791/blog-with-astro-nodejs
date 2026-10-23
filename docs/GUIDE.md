# Blog build and operations guide

This document records how <https://blog.zawaung.site> was built, why each
decision was made, how the code works, and how to run the site afterwards. The
short README covers commands; this guide covers reasoning.

Contents

1. [Goals and architecture](#1-goals-and-architecture)
2. [Server setup: what was done and why](#2-server-setup-what-was-done-and-why)
3. [How the code is written, and why](#3-how-the-code-is-written-and-why)
4. [Security model](#4-security-model)
5. [Docker](#5-docker)
6. [Problems met along the way](#6-problems-met-along-the-way)
7. [Running the site: posts, admin, maintenance](#7-running-the-site-posts-admin-maintenance)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Goals and architecture

The brief was a blog on `blog.zawaung.site` with Markdown posts, search,
moderated comments, a contact form, an admin area, and Docker for the dynamic
parts. It was built in four stages, confirming each one before starting the
next: static site, search, comments and contact form, then admin.

The central idea: **almost everything is static files, and only a very small
part is a running program.**

```
browser ──► nginx ──┬─ /            static files          (dist/client/, on the host)
                    ├─ /api/        ─► Node container      127.0.0.1:4321
                    └─ /admin/      ─► Node container      (basic auth + IP allowlist)
                                          │
                                          └─ SQLite file on Docker volume "blog-data"
```

Why this shape:

- **Static pages are fast, cheap and hard to attack.** A post is plain HTML
  generated once at build time. nginx serves it with no application code in
  the request path, so a bug in the Node code cannot take down or compromise
  the reading experience.
- **Dynamic features are isolated.** Comments, the contact form and moderation
  need a database and logic, so they live in a small Node server inside a
  locked-down container. nginx forwards only `/api/` and `/admin/` to it.
- **nginx serves `dist/client` directly from the host** (as specified), so
  static files never touch the container and the container can be restarted
  or rebuilt without any downtime for readers.

### Technology choices

| Choice | Why |
|---|---|
| **Astro 7** (`output: 'static'`) | Markdown content collections with schema validation, zero JavaScript by default, and the ability to mix prerendered pages with a few server-rendered routes in one project. |
| **`@astrojs/node`, standalone** | Produces a self-contained server (`dist/server/entry.mjs`) for the routes marked `prerender = false`. Used only for `/api/*` and `/admin/*`. |
| **Pagefind** | Search with no server: it indexes the built HTML into small static files and the browser searches them. Nothing to host, nothing to secure. |
| **SQLite via `better-sqlite3`** | One file, no database server, synchronous API that is simple and fast for a low-traffic blog. Ships prebuilt binaries, so no compiler is needed in the image. |
| **Keystatic** | A friendly editor that writes plain Markdown files into the repo. Kept **dev-only**: running it in production would need a writable posts directory and a rebuild trigger, which conflicts with a read-only container. |
| **Docker, multi-stage, non-root, read-only** | A small, reproducible runtime with minimal privileges. If the Node process were compromised, it could only write to one volume. |
| **nginx basic auth + IP allowlist** | Two independent checks in front of `/admin/`. Auth is enforced before a request reaches the app at all. |

---

## 2. Server setup: what was done and why

### 2.1 Pre-checks

- **nginx up to date.** `nginx -v` gave 1.24.0, and `apt-cache policy nginx`
  showed installed and candidate versions identical (`1.24.0-2ubuntu7.18`), so
  nothing needed upgrading. Ubuntu backports security fixes into this version
  number, which is why it is "old" but current.
- **Existing sites.** Other `*.zawaung.site` sites already used the standard
  `sites-available` / `sites-enabled` layout with certbot. The new site follows
  the same convention so it behaves like the rest.
- **sudo.** Commands needing root cannot be run from the assistant session
  (sudo requires a password on a real terminal). So the repo holds every
  config file, and the privileged steps were run by hand in a separate
  terminal.

### 2.2 DNS

`blog.zawaung.site` had no record, so Let's Encrypt could not have issued a
certificate. An **A record** to the server's IPv4 address
(`77.237.244.110`) was added at the registrar. The authoritative nameserver
answered immediately, but local resolvers kept a cached "does not exist"
answer for a few minutes (negative caching). Testing used
`curl --resolve blog.zawaung.site:443:127.0.0.1` to bypass DNS until it
caught up.

### 2.3 nginx server block and HTTPS

1. The server block (`deploy/nginx/blog.zawaung.site.conf`) was first written
   as plain HTTP serving a placeholder page.
2. It was installed into `sites-available`, symlinked into `sites-enabled`,
   checked with `nginx -t`, and reloaded.
3. `sudo certbot --nginx -d blog.zawaung.site` issued a Let's Encrypt
   certificate, added the HTTPS listener and certificate paths, and added the
   HTTP-to-HTTPS redirect. Certbot's systemd timer renews it automatically.

The file in the repo is the **final result**, including the lines certbot
added, so the repo is an accurate record of what is live.

### 2.4 The home-directory permission gotcha

The site lives under `/home/zawaung`, which is mode `750`. nginx runs as
`www-data` and so could not even walk into the directory, and `try_files`
reported that as a **404** (not 403). The fix was to grant `www-data`
*traverse-only* access (`x`, not `r`) to that one directory with an ACL
(`setfacl -m u:www-data:x /home/zawaung`). That lets nginx reach files it has
been given the exact path to, without letting it list or read the rest of the
home directory. `setfacl` was missing at first; it comes from the `acl`
package.

### 2.5 Admin protection

`/admin/` is guarded by **both** of these (`satisfy all`):

- **IP allowlist**, kept in its own snippet file
  (`/etc/nginx/snippets/blog-admin-allow.conf`, source in
  `deploy/nginx/blog-admin-allow.conf`). Keeping it separate means changing
  your IP never requires editing the main server block, and
  `deploy/set-admin-ip.sh` can do it safely.
- **HTTP basic auth** against `/etc/nginx/blog.htpasswd`, generated with
  `openssl passwd -apr1` (no extra packages needed).

Why both: an allowlist alone fails if someone shares your network or your IP
changes hands; a password alone is exposed to guessing from the whole
internet. Together, an attacker needs a trusted address *and* the password.

The admin location also: strips the `Authorization` header before proxying (the
app never needs your password), sets `Cache-Control: no-store`, and caps the
request body at 4 KB.

---

## 3. How the code is written, and why

### 3.1 Project layout

```
astro.config.mjs            Astro settings; loads Keystatic only in dev
keystatic.config.ts         editor schema (dev only)
src/content.config.ts       defines the "posts" collection and its fields
src/content/posts/          the Markdown posts
src/layouts/Base.astro      page shell: head, header/nav, footer
src/components/             PostList.astro, Comments.astro
src/pages/                  routes: index, posts/[id], tags/[tag], about, contact, search, rss.xml
src/pages/api/             server routes: health, comments, contact
src/pages/admin/           server routes: moderation page and its action handler
src/lib/db.ts               SQLite connection, schema, rate limiter, IP hashing
src/lib/http.ts             shared request guard + input validation helpers
src/lib/admin.ts            Origin check for admin form posts
src/styles/global.css       all styling (plain CSS, light/dark)
scripts/                    deploy.sh, backup.sh, restore.sh, dump.mjs
deploy/                     nginx config + allowlist helper
```

### 3.2 Stage 1: the static site

**Content collection (`src/content.config.ts`).** Posts are Markdown files with
YAML front matter. The collection defines a schema (`title`, `description`,
`pubDate`, optional `updatedDate`, `tags`, `draft`) with Zod. Why: a typo in
front matter (a missing title, a malformed date) fails the *build* with a clear
message instead of producing a broken page. `z.coerce.date()` lets you write
`2026-10-23` plainly.

**Drafts.** Every page that lists posts filters `!p.data.draft`. That means a
draft is excluded from the home page, tag pages, RSS, sitemap, search and its
own URL. Setting `draft: true` is a safe way to keep work in progress in the
repo.

**Routes.**

- `pages/index.astro` lists posts newest first.
- `pages/posts/[id].astro` uses `getStaticPaths` to generate one HTML file per
  post. The `id` is the Markdown filename without `.md`, so the filename is
  the URL (`hello-world.md` → `/posts/hello-world/`). Changing a filename
  changes the URL.
- `pages/tags/[tag].astro` generates one page per tag in use.
- `rss.xml.js` and the `@astrojs/sitemap` integration produce the feed and
  sitemap. `robots.txt` disallows `/admin` and `/api/`.

**Styling.** One small plain CSS file using custom properties for colours and a
`prefers-color-scheme: dark` block, so dark mode costs no JavaScript. No CSS
framework: the site is small, and fewer dependencies mean fewer updates and
fewer vulnerabilities.

**Output layout.** `@astrojs/node` is configured from the start, and a tiny
`/api/health` route (`prerender = false`) exists, so the build always produces
both `dist/client` (static files for nginx) and `dist/server` (the Node
server). Without at least one server route Astro emits only a flat `dist/`,
and the layout would change when Stage 3 arrived. The health route doubles as
the Docker health check.

### 3.3 Stage 2: search

`npm run build` is `astro build && pagefind --site dist/client`. Pagefind reads
the generated HTML and writes an index to `dist/client/pagefind/`. In the
browser, the search page loads Pagefind's UI script, which downloads only the
index fragments it needs.

Only post pages carry the `data-pagefind-body` attribute, which tells Pagefind
to index just those pages and just the article content (not navigation or
comments). The search page shows a note if the index is missing, because
`npm run dev` does not build one.

Verification: querying the built index for "pineapple" (a word placed only in
the sample post) returns exactly that post; a nonsense word returns nothing.

### 3.4 Stage 3: comments and contact form

**Database (`src/lib/db.ts`).** The connection opens lazily on first use,
creates the directory and tables if absent, and sets:

- `journal_mode = WAL`: readers don't block the writer; safe for concurrent
  requests and good for live backups.
- `busy_timeout = 5000`: a brief wait instead of an immediate "database is
  locked" error.

Tables: `comments` (with a `status` constrained by `CHECK` to
`pending | approved | rejected`), `messages`, `rate_limits`, and `meta`.
Because tables are created with `IF NOT EXISTS`, a fresh volume needs no
separate migration step.

**Privacy: hashed IPs.** The raw IP is never stored. `hashIp` computes
`sha256(salt + ip)` and keeps 32 hex characters. The salt is random, created
on first use and stored in `meta`. That is enough to rate limit and to see
"these two comments came from the same address" while storing no address. A
database leak does not reveal IPs.

**Rate limiting.** `rateLimit(key, max, windowSeconds)` is a fixed-window
counter in SQLite, run inside an immediate transaction so two simultaneous
requests cannot both slip past the limit. It returns `0` if allowed or the
number of seconds to wait (used for the `Retry-After` header). It lives in the
database, so limits survive container restarts. Limits are per IP hash:
comments 10/hour, contact 3/hour. **Every** request counts, including rejected
ones, which stops attackers probing for validation gaps. (The comment limit
was raised from 5 to 10 after testing showed typos could lock a real person
out.)

**Request guard (`src/lib/http.ts`, `guardedJsonPost`).** Both public POST
endpoints share one function that, in order:

1. checks the `Origin` header matches the site (blocks other websites from
   submitting on a visitor's behalf);
2. requires `Content-Type: application/json` (HTML forms from other sites
   can't send that cross-origin without a CORS preflight, which is refused);
3. rejects bodies over 16 KB (checks `Content-Length` first, then the real
   length);
4. applies the rate limit;
5. parses the JSON.

Sharing one guard means the two endpoints cannot drift apart in how strict they
are.

**Honeypot.** Forms contain an extra `website` field hidden off-screen (CSS
`position: absolute; left: -10000px`, not `display: none`, which some bots
detect) and marked `aria-hidden` / `tabindex="-1"` so real users and screen
readers never touch it. Bots tend to fill every field. If it is non-empty, the
server returns the same success response a real submission gets and stores
nothing, so a bot gets no signal to adapt to.

**Validation.** `text()` trims and enforces length and rejects control
characters; `email()` does a deliberately simple shape check. Real
verification of an email address requires sending mail, which is out of scope;
the address is only for you to reply. The comments API also confirms the post
actually exists by asking the content collection, so nobody can fill the
database with comments on invented posts.

**All queries are parameterized** (`?` placeholders), so there is no SQL
injection path.

**Showing comments (`Comments.astro`).** The page is static; a small script
fetches approved comments from `/api/comments?post=…` and builds the list with
`textContent`. Setting `textContent` (never `innerHTML`) means a comment
containing `<script>` is displayed as literal text and cannot execute. The
admin page gets the same protection from Astro's automatic escaping.

**Contact form.** `POST /api/contact` stores the message in SQLite. It is
**store-only** by design: sending mail needs SMTP credentials and creates a
spam-relay risk. You read messages on the moderation page.

### 3.5 Stage 4: moderation page and admin

**Moderation (`src/pages/admin/`).** `index.astro` is server-rendered on every
request (`prerender = false`) and reads pending comments, the latest 50
reviewed comments, and the latest 100 messages. Each item has a plain HTML
`<form method="post">` with buttons, so it works with no JavaScript.
`action.ts` handles the POST: approve, reject, delete a comment, or delete a
message, then redirects (303) back to the list.

**Authentication happens in nginx, not in the app.** The app has no login
code. That is a deliberate trade: less code means fewer bugs, and the app
only ever sees requests nginx has already approved. The consequence is a rule
to keep: **the container port must only be reachable via nginx** (it is bound
to `127.0.0.1`).

**CSRF defence (`src/lib/admin.ts`).** Because browsers attach basic-auth
credentials automatically, a malicious site could try to make your browser
POST an admin action. The action handler therefore requires an `Origin` header
equal to the site's own origin. Astro has a built-in check for this, but it
compares against the URL the app *sees* (`http://…` behind the proxy) rather
than the public `https://` one, so `security.checkOrigin` is turned off in
`astro.config.mjs` and replaced by this explicit check.

**Keystatic (`keystatic.config.ts`).** Defines a "Posts" collection matching
the content schema (title as slug, description, dates, tags, draft, Markdown
body) and `storage: { kind: 'local' }`, meaning it writes files directly into
`src/content/posts/`. In `astro.config.mjs` it is imported **only when the
command line contains `dev`**; production builds never load it. Its route is
`/keystatic` (the integration doesn't allow changing it), so it never conflicts
with `/admin`.

---

## 4. Security model

Layers, outermost first:

| Layer | Protects against |
|---|---|
| HTTPS (Let's Encrypt) | eavesdropping, tampering |
| nginx only proxies `/api/` and `/admin/` | exposing other app routes (Keystatic, internal endpoints) |
| `/admin/`: IP allowlist **and** basic auth | unauthorised moderation |
| nginx overwrites `X-Real-IP`; port bound to localhost | spoofing IPs to dodge rate limits |
| `Origin` checks (API and admin) | cross-site request forgery |
| Honeypot + rate limits + size/length limits | spam and abuse |
| Parameterized SQL, `textContent` / escaping | injection and XSS |
| Comments held as `pending` | spam and abuse ever being published unreviewed |
| Hashed IPs | leaking visitor addresses |
| Container: non-root, read-only filesystem, all capabilities dropped, `no-new-privileges` | limiting damage if the app were compromised |
| `npm audit` clean, lockfile committed, `npm ci` | known-vulnerable or drifting dependencies |

Verified by test: a spoofed `X-Real-IP` sent through nginx was ignored (the
recorded hash matched the real address, not the forged one); `/admin/` gave 401
without credentials, 401 with a wrong password, 403 from a non-allowlisted IP,
and 200 with both; a forged Origin on an admin action gave 403.

Known limits worth being aware of:

- The honeypot and rate limits stop casual spam, not a determined human or a
  distributed attack. Moderation is the real safety net.
- Basic auth sends the password with every request (safe over HTTPS, but
  there is no logout and no lockout after repeated failures).
- Whoever has shell access to the server can read the database.

---

## 5. Docker

### Image (`Dockerfile`)

Multi-stage, on a pinned base: `node:22.23.4-slim@sha256:…`. A tag *and* a
digest are pinned because tags can move; the digest guarantees byte-identical
base layers. Astro 7 requires Node ≥ 22.23.4, which is why the exact version is
named.

| Stage | What it does |
|---|---|
| `build` | `npm ci`, then `npm run build` (site, server bundle, Pagefind index). Has dev dependencies. |
| `prod-deps` | A separate `npm ci --omit=dev`, so the runtime image has no build tools, Keystatic, React or Pagefind. |
| `client` | `FROM scratch` containing only `dist/client`. Exists purely so the static site can be exported to the host. |
| `runtime` | prod dependencies + `dist` + `scripts/dump.mjs`, running as `node`. |

`npm ci --ignore-scripts` is used so dependency install scripts don't run
during the image build (supply-chain hygiene). This is safe here because
`better-sqlite3` ships prebuilt binaries and Pagefind's binary comes from an
optional platform package.

### Runtime (`docker-compose.yml`)

- `user: node` (uid 1000), `read_only: true`, `tmpfs: /tmp`,
  `cap_drop: [ALL]`, `no-new-privileges`.
- One writable path: the named volume `blog-data` at `/data` (database
  file, plus the `-wal` / `-shm` SQLite side files).
- `ports: "127.0.0.1:4321:4321"`: localhost only, never public.
- A health check calls `/api/health`.
- `restart: unless-stopped` so it comes back after reboots.

### Exporting the static site

`docker build --target client --output type=local,dest=DIR .` copies the
built site out of Docker into a normal directory. `scripts/deploy.sh` does this
into a temporary directory, fixes permissions, then swaps it in as
`dist/client` with two quick renames, so readers never see a half-written site.

### Backups (`scripts/`)

- `dump.mjs` runs *inside* the container and writes
  `db.serialize()` (a consistent snapshot, safe with WAL and live traffic) to
  stdout.
- `backup.sh` pipes that through gzip on the host, checks the result begins
  with the `SQLite format 3` header (so an empty or error output is never kept
  as a "backup"), sets mode `600`, and prunes to the newest 14.
- `restore.sh` validates the file, asks for confirmation, stops the container,
  streams the decompressed backup into the volume under a temporary name, and
  only then swaps it in (keeping the old file as `blog.db.before-restore`).

---

## 6. Problems met along the way

Recorded because they are the likeliest to come up again.

| Problem | Cause | Resolution |
|---|---|---|
| `sudo` fails from the assistant | needs a password on a terminal | privileged commands run by hand in a separate terminal; all config lives in the repo |
| Site returned 404 though files existed | `/home/zawaung` is mode 750; `www-data` couldn't traverse it | traverse-only ACL on the home directory (needs the `acl` package) |
| Local `curl https://blog…` failed right after DNS change | negative DNS cache | tested with `curl --resolve` until it expired |
| `astro check` hung for 5 minutes | it prompts to install `@astrojs/check` and waits on stdin | skipped; builds and tests cover the code. Add `@astrojs/check` as a dev dependency if you want type checking |
| Admin form posts would fail behind nginx | Astro's built-in origin check sees `http://`, the browser sends `https://` | disabled the built-in check; wrote an explicit `Origin` check |
| First restore attempt failed | the backup was mode 600 owned by the host user (uid 1001); the container's `node` user is uid 1000 and the file was bind-mounted | stream the backup via stdin instead of bind-mounting; write-then-swap so a failure can't destroy the live database |
| npm warned about install scripts | npm 11 gates dependency install scripts via `allowScripts` | `better-sqlite3` approved in `package.json`; image builds use `--ignore-scripts` |
| Test data in the live database | testing against the real container | removed afterwards; remember to delete any test comments you create |
| Rate limit blocked legitimate retries during testing | every request counts, and 5/hour was too tight | comments limit raised to 10/hour |

---

## 7. Running the site: posts, admin, maintenance

### 7.1 Writing a new post

Do this on a **development machine** (or this server, in a terminal), not in
production.

1. `git pull`, then `npm install` (first time only).
2. `npm run dev`, then open <http://localhost:4321/keystatic>.
3. Posts → Create entry. Fill in title, description, publish date, tags; write
   the Markdown body. Tick **Draft** while still writing.
4. Save. Keystatic writes `src/content/posts/<slug>.md`. Check the result at
   <http://localhost:4321/>.

Or skip Keystatic and create the file by hand:

```md
---
title: My post
description: One-line summary shown in lists and search results.
pubDate: 2026-10-23
tags: [example]
draft: false
---

Content here, in Markdown.
```

Notes:

- The **filename is the URL**: `my-post.md` → `/posts/my-post/`. Choose it
  carefully; renaming breaks existing links.
- Images: put them in `src/assets/` and reference them relatively, e.g.
  `![alt](../../assets/photo.jpg)`. Astro optimizes them at build time.
- `pubDate` controls ordering. `updatedDate` is optional and shown on the post.
- Use lowercase, hyphenated tags; each distinct tag becomes a `/tags/<tag>/` page.

To publish:

```sh
npm run build          # optional local check, includes the search index
git add -A && git commit -m "New post: my-post" && git push
# then on the server:
cd /home/zawaung/blog && git pull && scripts/deploy.sh
```

Publishing is a rebuild: new posts, tags, RSS entries, sitemap and the search
index all update together, because `scripts/deploy.sh` rebuilds all of them.

To **unpublish**, set `draft: true` (or delete the file) and redeploy.

### 7.2 Moderating comments and reading messages

Open <https://blog.zawaung.site/admin/> from an allowlisted IP and log in
(username `admin`, plus the password you set).

- **Pending comments** at the top: *Approve* (appears on the post immediately,
  no rebuild needed), *Reject* (kept, hidden), or *Delete* (removed).
- **Reviewed comments** (latest 50): change a decision later.
- **Contact messages** (latest 100): reply by email using the address shown,
  then *Delete* when done. Nothing is emailed to you automatically, so check
  this page periodically.

Every comment is held until you approve it, so an unchecked inbox only delays
comments; nothing unwanted is published.

### 7.3 If your IP address changes

Symptom: **403 Forbidden** on `/admin/`. The public site is unaffected. SSH to
the server (SSH is separate) and run:

```sh
sudo deploy/set-admin-ip.sh <new-ip> [more IPs or CIDR ranges]
```

Changing the password:

```sh
printf 'admin:%s\n' "$(openssl passwd -apr1)" | sudo tee /etc/nginx/blog.htpasswd
sudo chgrp www-data /etc/nginx/blog.htpasswd && sudo chmod 640 /etc/nginx/blog.htpasswd
```

nginx reads the file on each request; no reload is required.

### 7.4 Routine maintenance

**Daily (automatic): backups.** Add to `crontab -e`:

```
15 3 * * * /home/zawaung/blog/scripts/backup.sh >> /home/zawaung/blog/backups/backup.log 2>&1
```

Copy `backups/` somewhere else too (another machine or object storage). A
backup on the same disk does not survive disk failure. Occasionally test a
restore into a throwaway setup so you know the process works before you need
it.

**Monthly: updates.**

```sh
git pull
npm update
npm audit                # fix anything reported (npm audit fix, or bump the package)
npm run build            # confirm it still builds
git add package.json package-lock.json && git commit -m "Update dependencies"
scripts/deploy.sh
```

Also refresh the base image now and then to pick up Node and Debian security
fixes:

```sh
docker pull node:22-slim
docker image inspect node:22-slim --format '{{index .RepoDigests 0}}'
docker run --rm node:22-slim node -v
```

Put the new version tag and digest into `ARG NODE_IMAGE=` at the top of the
`Dockerfile`, then `scripts/deploy.sh`. Remove old images with
`docker image prune`.

**System.** `sudo apt update && sudo apt upgrade` keeps nginx and Docker
patched. Certbot renews certificates automatically; check with
`sudo certbot renew --dry-run`.

**Checks worth doing now and then.**

```sh
docker compose ps                 # should say "healthy"
docker compose logs --tail 50 blog
curl -s https://blog.zawaung.site/api/health
ls -lh backups/                   # recent files exist, sizes look sensible
df -h                             # disk space (images, volume, backups)
```

### 7.5 Rebuilding from scratch / disaster recovery

New server, same site:

1. Point DNS at the new server; install nginx, Docker, certbot.
2. `git clone` the repo.
3. Follow "First-time setup" in the README: nginx config, certificate, admin
   password and allowlist, `acl` permission if the site is under a home directory.
4. `scripts/deploy.sh` to build the site and start the container.
5. `scripts/restore.sh <latest off-machine backup>` to bring back comments and
   messages.

Posts are in git, so only the database needs restoring.

### 7.6 Where to change things

| To change | Edit |
|---|---|
| Site title, nav, footer | `src/layouts/Base.astro` (and the title in `src/pages/rss.xml.js`) |
| Look and feel | `src/styles/global.css` |
| About page text | `src/pages/about.astro` |
| Footer "Source" link | `src/layouts/Base.astro` (currently a placeholder GitHub link) |
| Comment/contact rate limits | `max` and `windowSeconds` in `src/pages/api/comments.ts` and `contact.ts` |
| Field length limits | the `text(...)` calls in the same two files |
| Post fields | `src/content.config.ts` **and** `keystatic.config.ts` (keep both in step) |
| nginx behaviour | `deploy/nginx/blog.zawaung.site.conf`, then copy to `/etc/nginx/sites-available/` and reload |

After editing code or content, run `scripts/deploy.sh`.

---

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `/admin/` shows 403 | Your IP is not allowlisted → `sudo deploy/set-admin-ip.sh <ip>` |
| `/admin/` keeps asking for a password | Wrong password; reset it (7.3). Check the htpasswd file is readable by `www-data`. |
| `/admin/` or `/api/` gives 502 | Container is down. `docker compose ps`, `docker compose logs blog`, `docker compose up -d`. |
| Whole site gives 404 or 403 | `dist/client` missing or unreadable → rerun `scripts/deploy.sh`; check the `www-data` ACL on the home directory. |
| New post not showing | Not deployed (`scripts/deploy.sh`), `draft: true`, or `pubDate` in the front matter malformed (the build prints the error). |
| Search finds nothing / "dev" note | Index only exists after `npm run build`; deploy again. |
| Comment form says "Forbidden" | The `Origin` check failed: `SITE_ORIGIN` in `docker-compose.yml` must match exactly the address in the browser (`https://blog.zawaung.site`). |
| Comment form says "Too many requests" | Rate limit hit (10 comments or 3 messages per hour per IP). Wait an hour, or run `docker compose exec blog node -e "new (require('better-sqlite3'))('/data/blog.db').prepare('delete from rate_limits').run()"`. |
| Container restarts repeatedly | `docker compose logs blog`. Common: volume not writable (should be owned by uid 1000), or a build error. |
| `nginx -t` fails after a change | The message names the file and line. If it mentions `blog-admin-allow.conf`, that snippet file is missing → `sudo deploy/set-admin-ip.sh <ip>`. |
| Build fails after editing a post | Front matter does not match the schema; the error names the file and field. |
| Disk filling up | `docker system df`; `docker image prune`; trim `backups/`. |

Inspecting data directly (read-only is safest):

```sh
docker compose exec blog node -e "
const D=require('better-sqlite3'); const d=new D('/data/blog.db',{readonly:true});
console.log(d.prepare(\"select status, count(*) n from comments group by status\").all());"
```
