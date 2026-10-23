import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

// Pages are prerendered static (output: 'static'). Only routes that set
// `prerender = false` (under src/pages/api) run in the Node server.
export default defineConfig({
  site: 'https://blog.zawaung.site',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap()],
  server: { host: true },
});
