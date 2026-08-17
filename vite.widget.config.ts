// vite.widget.config.ts
//
// Library build for the embeddable quote widget: src/widget/entry.ts →
// public/widget/quote.js (IIFE, self-contained — no imports at runtime) +
// public/widget/quote.css. Run by `npm run widget:build`, and automatically
// by `npm run dev` and `npm run build` (prebuild). public/widget/ is
// git-ignored; it is a build artifact.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // outDir lives inside publicDir; without this Vite would copy the whole
  // of public/ into public/widget/ on every build.
  publicDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: {
    // Public site key, baked in at build time. Empty locally → the widget
    // renders no Turnstile and loads no Turnstile script.
    __TURNSTILE_SITE_KEY__: JSON.stringify(process.env.PUBLIC_TURNSTILE_SITE_KEY ?? ''),
  },
  build: {
    lib: {
      entry: 'src/widget/entry.ts',
      name: 'BioKEAQuote',
      formats: ['iife'],
      fileName: () => 'quote.js',
      cssFileName: 'quote',
    },
    outDir: 'public/widget',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
