import type { APIRoute } from 'astro';
import { sameOrigin } from '../../lib/admin';
import { getDb } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const id = Number(form.get('id'));
  if (!Number.isInteger(id) || id < 1) return new Response('Bad request', { status: 400 });

  const db = getDb();
  let changed = 0;
  switch (action) {
    case 'approve':
      changed = db.prepare(`UPDATE comments SET status = 'approved' WHERE id = ?`).run(id).changes;
      break;
    case 'reject':
      changed = db.prepare(`UPDATE comments SET status = 'rejected' WHERE id = ?`).run(id).changes;
      break;
    case 'delete-comment':
      changed = db.prepare(`DELETE FROM comments WHERE id = ?`).run(id).changes;
      break;
    case 'delete-message':
      changed = db.prepare(`DELETE FROM messages WHERE id = ?`).run(id).changes;
      break;
    default:
      return new Response('Bad request', { status: 400 });
  }
  if (!changed) return new Response('Not found', { status: 404 });
  return redirect(`/admin/?done=${encodeURIComponent(action)}`, 303);
};
