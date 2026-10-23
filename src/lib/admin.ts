const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://blog.zawaung.site';

/**
 * Admin POSTs must come from the site itself. nginx basic auth makes browsers
 * attach credentials automatically, so this is the CSRF defence.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === SITE_ORIGIN) return true;
  return process.env.ALLOW_LOCALHOST === '1' && origin !== null && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
