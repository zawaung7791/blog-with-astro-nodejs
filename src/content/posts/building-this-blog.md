---
title: Building this blog with Astro, Node.js, nginx and Docker
description: Why I built a minimal, hands-on blog instead of using WordPress, and how the pieces fit together.
pubDate: 2026-10-23
tags: [blog, minimal, astro, nodejs, nginx, docker]
draft: true
---

I wanted a blog I fully understand, without the overhead of WordPress. This is
a tour of what I built, and why each piece is there.

## The idea: static first

Almost everything on this site is a plain HTML file. Posts are Markdown files
in a git repository; [Astro](https://astro.build) turns them into static pages
at build time, and nginx serves those files straight from disk. There is no
application code in the path when you read a post, which makes it fast and
leaves very little to attack.

Only the interactive bits need a running program: comments, the contact form
and a moderation page. Those live in a small Node.js server inside a Docker
container, and nginx forwards just two paths to it.

```
browser ──► nginx ──┬─ /          static files from disk
                    ├─ /api/      ─► Node container (comments, contact form)
                    └─ /admin/    ─► Node container (password + IP allowlist)
                                         │
                                         └─ SQLite file on a Docker volume
```

## The pieces

**Astro** handles the pages. Posts are a content collection with a schema, so
a typo in a post's front matter fails the build with a clear message instead of
quietly producing a broken page. Drafts are a single `draft: true` line.

**Search** is [Pagefind](https://pagefind.app). After each build it indexes the
generated HTML into small static files, and the browser searches them directly.
There is no search server to run or secure.

**Comments and the contact form** use SQLite through `better-sqlite3`: one
file, no database server. Every comment is held for moderation, so spam is
never published unreviewed. Contact messages are stored, not emailed, because
sending mail would mean SMTP credentials and a way to be abused as a relay. Spam
protection is deliberately modest: a hidden honeypot field and a per-IP rate
limit. IP addresses are stored only as a salted hash.

**The editor** is Keystatic, but only on my development machine. It writes
plain Markdown into the repository, and it is not part of the production build
at all. The server never gets a writable editor to attack.

## The locked-down part

The container is where I was most careful:

- a pinned base image (`node:22-slim`, by tag and digest) and a multi-stage
  build, so the runtime image carries no build tools
- runs as a non-root user, with a read-only filesystem
- the only writable place is the volume holding the SQLite file
- all Linux capabilities dropped, and the port published on `127.0.0.1` only

On the nginx side, `/admin/` needs both a password and an allowed IP address.
Nothing else is proxied, so the editor and internal routes simply do not exist
on the public site.

## Things that bit me

- nginx returned 404, not 403, because it could not walk into my home
  directory. A traverse-only ACL for the nginx user fixed it.
- Astro's built-in cross-site check for form posts compares against the URL it
  sees (plain `http` behind the proxy), so admin forms were at risk of being
  rejected. I turned it off and wrote an explicit `Origin` check instead.
- My first restore script moved the live database aside before failing on a
  file permission, which is exactly the wrong order. It now writes the new file
  first and swaps only on success. I only found that by actually testing a
  restore.

## Keeping it running

There is no auto-updating dashboard, so upkeep is mine: a nightly cron job
takes a verified backup of the database, and about once a month I update
dependencies, run `npm audit`, refresh the base image and redeploy with one
script. The whole site, apart from the database, is in git, so rebuilding on
a new server is a clone, a deploy and a restore.

I built it with help from Claude Code, working in four stages and confirming
each before moving on. The full write-up, with the reasoning behind every
decision, is in the repository's
[guide](https://github.com/zawaung7791/blog-with-astro-nodejs/blob/main/docs/GUIDE.md).
