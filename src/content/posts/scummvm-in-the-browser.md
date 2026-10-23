---
title: Classic adventure games in the browser with ScummVM and WebAssembly
description: Compiling ScummVM to WebAssembly so point-and-click adventures run entirely in the visitor's browser.
pubDate: 2026-10-24
tags: [webapp, scummvm, webassembly, docker, nginx]
draft: true
---

[ScummVM](https://www.scummvm.org) is a free engine that runs classic
point-and-click adventures, such as *Beneath a Steel Sky*, *Flight of the Amazon
Queen* and *Lure of the Temptress*. This project compiles it to WebAssembly and
serves it from my own server, so a game runs in a browser tab with nothing to
install.

## The key idea: the server only serves files

There is no game server. The container is plain nginx serving static files. The
game itself runs entirely in the visitor's browser, in WebAssembly:

```
browser ──HTTPS──► host nginx ──► container (nginx + basic auth)
                                   ├─ scummvm.html / .js / .wasm
                                   └─ data/games/<game>   (the game files)
```

Saves and settings go to the browser's IndexedDB, so they belong to one browser
on one device, and the server stores nothing about players.

## Building it

The Dockerfile has two stages. The first clones ScummVM and uses its own
Emscripten build script to compile it to WebAssembly. It builds with
`--enable-plugins --default-dynamic`, which makes each game engine a separate
file that loads only when needed, so a visitor does not download engines for
games they are not playing. The engine list is a build argument: fewer engines
mean a faster build and a smaller download. The second stage copies the output
into a small nginx image.

The first build is heavy: roughly 4 GB of RAM, 10 GB of disk and 30 to 60
minutes. After that it is cached.

## Two details that make it work

**A browser cannot list a directory over HTTP.** ScummVM needs to know which
files a game has, so at container start a script runs ScummVM's own
`make_http_index.py`, which writes an `index.json` into every folder. This is
why the container has to be restarted after a new game is added.

**WebAssembly needs the right MIME type.** Browsers refuse to compile `.wasm`
unless it is served as `application/wasm`, so the container's nginx config
declares that explicitly. The same config tells browsers to revalidate the app
files (they are not content-hashed) but cache the large, rarely changing game
data for a week.

## Why it is behind a password

The whole site is behind HTTP basic auth. Game data keeps its own licence, and
the project's licensing is split: the wrapper files (Dockerfile, configs and
scripts) are MIT, while ScummVM itself is GPLv3 and the built image contains it.
The password file and the games folder are both git-ignored, so neither ends up
in a public repository.

## Things to know

- The container publishes its port on localhost only, and the host nginx turns
  off proxy buffering so large game files stream instead of being written to
  disk first.
- A newer ScummVM means rebuilding with no cache. A `SCUMMVM_REF` argument pins a
  tag or commit if you want reproducible builds.
- If a low-memory server cannot build it, build elsewhere and move the image
  with `docker save | ssh … docker load`.
- Audio stays silent until the first click or key press, because browsers block
  autoplaying sound.
