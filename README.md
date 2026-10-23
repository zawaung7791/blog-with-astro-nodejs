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
