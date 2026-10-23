---
title: POV-Ray in the browser, without letting strangers run code
description: A web front end for the POV-Ray ray tracer, and the sandboxing needed to make that safe to put online.
pubDate: 2026-10-24
tags: [webapp, povray, python, docker, security]
draft: true
---

[POV-Ray Online](https://povray.render.zawaung.site) is a page where you paste
a scene or upload a `.pov` file, press Render, and watch a ray-traced image
appear. It is about 350 lines in total: a FastAPI back end that runs the real
`povray` program, and one static HTML page.

## The interesting problem

A POV-Ray scene is not just data, it is a program. The scene language can read
and write files and (unless told not to) run shell commands. Putting a
renderer on the public internet is therefore the same as letting strangers run
code on your server, and most of the work here is making that safe.

## How a render works

1. The page posts the scene, a size (320×240, 640×480 or 1024×768) and a
   quality (Draft, Good or Best).
2. The server saves the scene in a job folder named by a random 128-bit ID and
   puts the job on a queue.
3. A single worker thread takes jobs one at a time and runs `povray` on them.
4. The page polls for status. Progress comes from reading POV-Ray's console
   output as it is produced and matching its "Rendered N of M pixels" lines, so
   the progress bar and live log are real, not faked.
5. When it finishes, the page fetches the PNG.

## The sandbox

Several independent layers, so that one mistake does not undo the rest:

- **POV-Ray's own settings** (`povray.conf`): restricted file access, shell-out
  forbidden, and reads and writes allowed only inside the job directory and the
  standard include files.
- **Per-render limits:** a 120 second timeout, a memory cap enforced with
  `setrlimit`, a cap on the size of any output file, and a maximum image size
  of 1280×960. A scene source over 200 KB is refused.
- **Queue and rate limits:** at most 20 queued jobs (further requests get a
  "server busy" reply) and 5 submissions per minute per IP address.
- **Cleanup:** a background thread deletes jobs after an hour.
- **The container:** non-root, read-only root filesystem with a tmpfs for
  scratch space, all capabilities dropped, no-new-privileges, and limits of 2
  CPUs, 2 GB of memory and 200 processes.

Job IDs are validated against a strict pattern before any file path is built
from them, which closes off path tricks like `../`.

## Limits

- One render runs at a time, so a heavy scene makes everyone else wait. That is
  deliberate: it is the simplest way to protect a small server.
- Job state is kept in memory, so restarting the container forgets queued and
  running jobs.
- Rendering is CPU-bound and slow for complicated scenes, which is the nature
  of ray tracing. Draft quality is the quick way to check a scene before
  committing to a Best render.
