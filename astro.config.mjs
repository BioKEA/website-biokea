// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const hiddenFromSitemap = ['/404', '/projects/sdl-moonshot'];

export default defineConfig({
  site: 'https://biokea.ai',
  // Two of the shipped game bundles (built from BioKEA/game-* repos) still
  // hardcode https://biokea.ai/mission/games/leaderboard in their score
  // prompt. Keep these two redirects until those repos are rebuilt.
  redirects: {
    '/mission/games': 'https://games.biokea.ai/',
    '/mission/games/leaderboard': 'https://games.biokea.ai/leaderboard',
  },
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
