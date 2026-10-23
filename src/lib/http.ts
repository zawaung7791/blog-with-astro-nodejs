import { hashIp, rateLimit } from './db';

const MAX_BODY_BYTES = 16 * 1024;
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://blog.zawaung.site';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

/**
 * The client IP. nginx overwrites X-Real-IP with the real peer address, and the
 * container port is only published on 127.0.0.1, so the header can be trusted.
 */
export function clientIp(request: Request, clientAddress: string | undefined): string {
  return request.headers.get('x-real-ip') ?? clientAddress ?? 'unknown';
}

type Parsed = { ok: true; data: Record<string, unknown> } | { ok: false; response: Response };

/** Common checks for JSON POST endpoints: origin, content type, size, rate limit. */
export async function guardedJsonPost(
  request: Request,
  clientAddress: string | undefined,
  limit: { name: string; max: number; windowSeconds: number },
): Promise<(Parsed & { ok: true; ipHash: string }) | { ok: false; response: Response }> {
  const origin = request.headers.get('origin');
  if (origin && origin !== SITE_ORIGIN && !(process.env.ALLOW_LOCALHOST === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return { ok: false, response: json({ error: 'Forbidden' }, 403) };
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return { ok: false, response: json({ error: 'Expected JSON' }, 415) };
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'Too large' }, 413) };

  const ipHash = hashIp(clientIp(request, clientAddress));
  const wait = rateLimit(`${limit.name}:${ipHash}`, limit.max, limit.windowSeconds);
  if (wait > 0) {
    return {
      ok: false,
      response: json({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': String(wait) }),
    };
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'Too large' }, 413) };
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return { ok: true, data, ipHash };
  } catch {
    return { ok: false, response: json({ error: 'Invalid JSON' }, 400) };
  }
}

/** Trims and bounds a string field; returns null if it is missing or the wrong length. */
export function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().replace(/\r\n/g, '\n');
  // eslint-disable-next-line no-control-regex
  if (v.length < min || v.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) return null;
  return v;
}

export function email(value: unknown, required: boolean): string | null | undefined {
  if (value === undefined || value === null || value === '') return required ? undefined : null;
  const v = text(value, 3, 254);
  if (!v || /\s/.test(v) || !/^[^@]+@[^@]+\.[^@]+$/.test(v)) return undefined;
  return v;
}
