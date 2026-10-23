import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getDb } from '../../lib/db';
import { email, guardedJsonPost, json, text } from '../../lib/http';

export const prerender = false;

const POST_ID = /^[a-z0-9][a-z0-9-_]{0,100}$/i;

async function postExists(id: string): Promise<boolean> {
  const posts = await getCollection('posts', (p) => !p.data.draft);
  return posts.some((p) => p.id === id);
}

// Approved comments for a post.
export const GET: APIRoute = async ({ url }) => {
  const post = url.searchParams.get('post') ?? '';
  if (!POST_ID.test(post)) return json({ error: 'Bad post' }, 400);
  const rows = getDb()
    .prepare(`SELECT id, author, body, created_at FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at, id`)
    .all(post);
  return json({ comments: rows });
};

// New comments are always stored as 'pending' until moderated.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const g = await guardedJsonPost(request, clientAddress, { name: 'comment', max: 10, windowSeconds: 3600 });
  if (!g.ok) return g.response;
  const d = g.data;

  // Honeypot: real users never see or fill this field. Pretend success.
  if (typeof d.website === 'string' && d.website !== '') return json({ ok: true, status: 'pending' }, 202);

  const post = text(d.post, 1, 100);
  const author = text(d.author, 1, 80);
  const body = text(d.body, 2, 2000);
  const mail = email(d.email, false);
  if (!post || !POST_ID.test(post) || !author || !body || mail === undefined) {
    return json({ error: 'Please check the form fields.' }, 400);
  }
  if (!(await postExists(post))) return json({ error: 'Unknown post' }, 404);

  getDb()
    .prepare(`INSERT INTO comments (post_id, author, email, body, ip_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(post, author, mail, body, g.ipHash);
  return json({ ok: true, status: 'pending' }, 202);
};
