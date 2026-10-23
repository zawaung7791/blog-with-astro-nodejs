# Blog

A personal blog built with [Astro](https://astro.build), served at
<https://blog.zawaung.site>.

Posts are Markdown files in `src/content/posts/`, prerendered to static HTML
in `dist/client/`, which nginx serves directly.

## Development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs dist/client (static site) and dist/server (API)
```

Requires Node 22.23.4 or newer.

## Search

[Pagefind](https://pagefind.app) indexes the built site: `npm run build` runs
`pagefind --site dist/client` after `astro build`, writing the index to
`dist/client/pagefind/`. Only post pages are indexed (the `data-pagefind-body`
attribute in `src/pages/posts/[id].astro`). The search page is `/search/`. Search
isn't available under `npm run dev`; build first and serve `dist/client`.

## Comments and contact form

Both are small JSON APIs run by the Node server (`dist/server/entry.mjs`, built
with `@astrojs/node` in standalone mode). Everything else is static.

- `GET /api/comments?post=<id>` returns approved comments only.
- `POST /api/comments` stores a comment as `pending`; it is hidden until approved.
- `POST /api/contact` stores a message (nothing is emailed).

Data lives in SQLite (`better-sqlite3`) at `DB_PATH` (see `.env.example`).
Spam protection: a hidden `website` honeypot field (filled = silently dropped),
and a per-IP fixed-window rate limit kept in SQLite (comments 10/hour, contact
3/hour). IPs are stored only as a salted hash. nginx proxies just `/api/` to the
container and sets `X-Real-IP`; the app trusts that header, so the container port
must only be reachable from localhost.

Run locally after a build:

```sh
HOST=127.0.0.1 PORT=4321 DB_PATH=./data/blog.db node dist/server/entry.mjs
```

## Writing a post

Add `src/content/posts/my-post.md`:

```md
---
title: My post
description: One-line summary.
pubDate: 2026-10-23
tags: [example]
---

Content here.
```

Set `draft: true` to keep a post out of the build.

## Deployment

The nginx server block lives in `deploy/nginx/blog.zawaung.site.conf`.

More sections (search, comments, Docker, backup and restore) are added as the
project grows.

## License

[MIT](LICENSE)
