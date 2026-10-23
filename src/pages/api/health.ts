import type { APIRoute } from 'astro';

// Runs in the Node server (not prerendered); used for container health checks.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
