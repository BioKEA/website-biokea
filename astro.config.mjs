// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const hiddenFromSitemap = ['/404', '/projects/sdl-moonshot'];

export default defineConfig({
  site: 'https://biokea.ai',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !hiddenFromSitemap.some((path) => page.includes(path)) }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
