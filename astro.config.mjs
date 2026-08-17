// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const hiddenFromSitemap = ['/404', '/projects/sdl-moonshot', '/admin'];

export default defineConfig({
  site: 'https://biokea.ai',
  output: 'server',
  security: {
    // Astro's built-in CSRF check is same-origin only, which 403s the
    // in-game "Lab updates" pill posting from games.biokea.ai to
    // /api/subscribe. src/middleware.ts re-applies the same check with an
    // allow-list (src/lib/origin-check.ts).
    checkOrigin: false,
  },
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !hiddenFromSitemap.some((path) => page.includes(path)) }),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Vite's dev server answers every OPTIONS request itself (default
      // `cors: true`) before it ever reaches an Astro route, which would
      // swallow /api/quote's own preflight handler (src/lib/cors.ts) in
      // `astro dev`. Production (the built Worker) has no such middleware,
      // so disabling it here just makes dev match prod.
      cors: false,
    },
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
