import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { email, guardedJsonPost, json, text } from '../../lib/http';

export const prerender = false;

// Messages are stored only (no email is sent); read them on the admin page.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const g = await guardedJsonPost(request, clientAddress, { name: 'contact', max: 3, windowSeconds: 3600 });
  if (!g.ok) return g.response;
  const d = g.data;

  if (typeof d.website === 'string' && d.website !== '') return json({ ok: true }, 202);

  const name = text(d.name, 1, 80);
  const mail = email(d.email, true);
  const body = text(d.body, 5, 5000);
  if (!name || !mail || !body) return json({ error: 'Please check the form fields.' }, 400);

  getDb().prepare(`INSERT INTO messages (name, email, body, ip_hash) VALUES (?, ?, ?, ?)`).run(name, mail, body, g.ipHash);
  return json({ ok: true }, 202);
};
