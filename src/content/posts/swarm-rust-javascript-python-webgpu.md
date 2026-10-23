---
title: Swarm, racing Rust, JavaScript, Python and WebGPU
description: The same three particle simulations written in four ways and run side by side in the browser.
pubDate: 2026-10-24
tags: [webapp, rust, webassembly, webgpu, benchmark]
draft: true
---

[Swarm](https://swarm.zawaung.site) runs three particle simulations, each
written several times over, and races the versions against each other live in
your browser. The simulations are a spiral galaxy, fireworks, and a flock of
birds.

## What is being raced

| Lane | How it runs |
|---|---|
| Rust | compiled to WebAssembly, with SIMD (four particles per instruction) |
| JavaScript | typed arrays, no objects per particle |
| Python + NumPy | NumPy running inside the browser through Pyodide |
| WebGPU | compute shaders on the graphics chip, including the drawing |

Each lane runs in its own Web Worker and draws to its own canvas, so they don't
slow each other down or block the page. The views are side by side (Rust and
JavaScript), a three-way race (adding NumPy), CPU against GPU, and full-screen
single lanes. A link such as `#race/flock` or `#gpu/galaxy` opens a particular
view.

## The simulations

- **Galaxy:** gravity from a central mass, and clicking drops black holes.
- **Fireworks:** bursts with gravity, air drag and fading sparks. Black holes
  swallow sparks.
- **Flock:** each bird matches the heading of the birds near it. A grid of
  neighbourhood cells means each bird only looks at nearby cells, which is what
  lets it scale to millions of birds. Click to send in a hawk.

## Keeping the race fair

A benchmark is only worth anything if every lane does the same work. For
instance, the flock's gentle breeze needs a sine function, and each language's
built-in one differs in speed and accuracy. So all of the lanes use the same
fast polynomial approximation of sine (accurate to about 0.1%), keeping the
comparison like for like.

## The GPU lane

The WebGPU lane is the most involved. All three simulations run as compute
shaders. After moving, each particle adds itself to its own pixel's count with
an atomic operation, and a final pass turns those counts into colours directly
on the canvas. Each frame goes to the GPU as a single batch, and the GPU
timestamps its own passes, so the Physics figure it reports includes the pixel
counting. It goes up to 16 million particles, while the CPU lanes stop at 4
million. It needs a browser with WebGPU in workers, such as a recent Chrome or
Edge.

## How it's served

There is no server logic at all. Docker runs nginx serving static files: the
page, the JavaScript, and the compiled `swarm.wasm`. The Rust source builds
inside the Docker image. The NumPy lane downloads Pyodide and NumPy (about 10
MB) from a CDN the first time and browsers cache it afterwards.

## Notes

- Results depend heavily on your machine, browser and whether WebGPU is
  available. The point is the comparison on one machine, not an absolute score.
- Needs a recent browser: Chrome, Edge, Firefox, or Safari 16.4 or later.
