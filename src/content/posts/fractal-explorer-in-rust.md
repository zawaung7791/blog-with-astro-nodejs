---
title: A fractal explorer with a Rust tile server
description: Mandelbrot, Julia, Burning Ship and Tricorn fractals rendered on demand as map tiles by a small Rust service.
pubDate: 2026-10-24
tags: [webapp, fractals, rust, docker]
draft: false
---

[Fractal Explorer](https://fractal.zawaung.site) lets you pan and zoom
around the Mandelbrot set, Julia sets, the Burning Ship and the Tricorn the way
you would use a web map. That is not a coincidence: it is built on the same
idea as a map.

## Fractals as map tiles

A web map never loads one huge picture. It loads small square tiles for the
part you are looking at, at the zoom level you are looking at. The fractal
explorer does exactly that, with [Leaflet](https://leafletjs.com) in the browser
and a Rust (Axum) server that, instead of looking tiles up, **calculates** them.

A request for tile `/tile/z/x/y` works out which rectangle of the complex plane
that tile covers (4 divided by 2<sup>z</sup> wide), then runs the escape-time
calculation for each of its 256×256 pixels: repeat `z = z² + c`, count how many
steps it takes to blow up, and colour the pixel by that count. The result is
encoded as a PNG and sent back.

## What makes it look good

- **Smooth colour:** plain iteration counts produce visible bands. The server
  uses the normalised iteration count, which interpolates between steps and
  gives smooth gradients.
- **Palettes:** colours come from cosine palettes, `a + b·cos(2π(c·t + d))`,
  which is a tiny formula with a lot of variety.
- **Detail control:** the number of iterations grows with zoom level
  (`150 + 45 × zoom`, capped at 30,000) and a Detail slider multiplies it. Deep
  zooms look blobby when there are too few iterations, so you turn it up.
- **Julia sets:** right-click a point on the Mandelbrot set to open the Julia
  set for that point.
- **Shareable links:** "Copy link" stores the position, fractal and colours in
  the URL.

## Why Rust, and why nginx caches the result

Every tile is 65,536 pixels, each iterated up to thousands of times in
floating-point maths, which is the kind of work where a compiled language earns
its keep. The release build
uses full optimisation and link-time optimisation, so the first Docker build is
slow, but the service itself is small: Axum, Tokio, and the `png` crate.

Tiles never change for a given fractal and settings, so nginx caches them on
disk for 30 days. Popular areas become instant after the first visitor, and the
Rust service only does work for tiles nobody has asked for yet.

## The limit you hit eventually

The zoom stops at about 2<sup>46</sup>, roughly 70 trillion times. That is not
an arbitrary cap: 64-bit floating-point numbers run out of precision there, and
adjacent pixels start mapping to the same number, so the image turns into
blocks. Going deeper needs a different technique (arbitrary precision, or
perturbation methods). I chose to stop at the limit of the simple approach.
