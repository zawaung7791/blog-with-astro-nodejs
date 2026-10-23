import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

// The Keystatic editor (at /keystatic) is for editing on a dev machine only:
// it is loaded for `astro dev` and never for `astro build`, so it is absent
// from the production site and image.
const dev = process.argv.includes('dev');
const editor = [];
if (dev) {
  const react = (await import('@astrojs/react')).default;
  const keystatic = (await import('@keystatic/astro')).default;
  editor.push(react(), keystatic());
}

// Pages are prerendered static (output: 'static'). Only routes that set
// `prerender = false` (src/pages/api, src/pages/admin) run in the Node server.
export default defineConfig({
  site: 'https://blog.zawaung.site',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap(), ...editor],
  server: { host: true },
  // Astro's built-in check compares Origin to the request URL, which is http://
  // behind nginx; src/lib/admin.ts does an explicit Origin check instead.
  security: { checkOrigin: false },
});
