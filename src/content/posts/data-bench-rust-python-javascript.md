---
title: Data bench, the same analytics job in six engines
description: A website that runs one data-analytics workload in Rust, Node.js, pandas, Polars, pure Python and the browser, and compares the speed.
pubDate: 2026-10-24
tags: [webapp, benchmark, rust, python, nodejs, docker]
draft: true
---

[Data bench](https://bench.zawaung.site) asks how much the language matters
for a typical data-analytics job. It runs the same workload in six different
engines and shows the timings side by side.

## The six engines

| Engine | How it's built |
|---|---|
| Rust | axum server, release build, parallel across all cores with rayon |
| JavaScript | Node.js 22, typed arrays in shared memory, one worker thread per core |
| Python + pandas | FastAPI, vectorised NumPy and pandas, one core |
| Python + Polars | FastAPI, fully Polars-native including data generation, all cores |
| Python (pure) | FastAPI, plain loops, one process per core over shared memory |
| JavaScript in the browser | the same code, one Web Worker per core on your own device |

The last one is the odd one out: it runs on the visitor's machine instead of
the server, which makes it a comparison between my VPS and whatever you are
holding.

## The workload

Every engine generates the identical dataset from the same pseudo-random
generator (mulberry32), then does this:

- generate the data, then filter it
- group by category, and by region and category
- join against a 100,000-row customer table
- group by customer (up to 100,000 groups)
- text search and a group-by on a string column
- a full sort, and summary statistics

## Making the comparison honest

Benchmarks are easy to get wrong in a flattering direction, so two rules:

- **Everything is cross-checked.** The page compares every engine's results
  against the others, so a wrong implementation shows up as a mismatch instead
  of a suspiciously fast time.
- **The data is identical,** not merely similar, thanks to the shared generator.

I also tried to be explicit about what each engine is allowed to use. pandas
has no built-in parallelism, so it gets one core; Polars and Rust use all of
them. If you want to compare at a fixed core count, each engine has a setting
for that in the compose file.

## How it is put together

```
browser ──► nginx (static page, reverse proxy)
              ├─ /api/rust/    ─► Rust service
              ├─ /api/python/  ─► FastAPI (pure, pandas, Polars)
              └─ /api/node/    ─► Node service
```

Four containers, each with its own job. Each service runs one benchmark at a
time and replies 429 if it is busy, so a public page cannot be used to pile up
work on the server, and the number of rows per request is capped so one visitor
can't request a run that exhausts memory.

## A detail worth knowing

The browser lane uses shared memory between workers, which browsers allow only
on pages that are cross-origin isolated. The page's nginx config therefore sets
the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers;
without them the browser lane falls back to a single core.

## Reading the results

Use the numbers for relative comparisons on one run, not as universal truths.
The engines differ in more than language: Polars and pandas are libraries
written mostly in compiled code, so "Python" being fast or slow here is partly
a statement about its libraries, not just the interpreter.
