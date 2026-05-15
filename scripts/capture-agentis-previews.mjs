#!/usr/bin/env node
// scripts/capture-agentis-previews.mjs
//
// Render the Agentis HTML mockups in tmp/atproto/ to WebP screenshots
// under src/assets/images/agentis-previews/ so they can be embedded
// on /agentis as static cards. The mockups are interactive
// prototypes (Leaflet maps, JS-driven scrolling, etc.) but we only
// want the look — Playwright headless renders each at a fixed
// viewport with a generous network/timeout budget, then captures a
// full-page WebP at quality 80.
//
// Usage:
//   node scripts/capture-agentis-previews.mjs
//
// Re-run whenever a mockup changes. Output is committed so CI/Pages
// builds don't need Playwright at build time.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'tmp', 'atproto');
const OUT_DIR = join(ROOT, 'src', 'assets', 'images', 'agentis-previews');

// One entry per mockup. `mobile` flips the viewport into phone
// dimensions for the mobile-field shot only; everything else gets
// a desktop viewport that matches the marketing-grid card aspect
// ratio (~16:10) at native 2× density for retina sharpness.
const MOCKUPS = [
  { slug: 'gallery',      file: 'index.html',            mobile: false, settleMs: 1200 },
  { slug: 'landing',      file: '01-landing.html',       mobile: false, settleMs: 1200 },
  { slug: 'dashboard',    file: '02-dashboard.html',     mobile: false, settleMs: 3500 }, // Leaflet tiles
  { slug: 'peer-review',  file: '03-peer-review.html',   mobile: false, settleMs: 1500 },
  { slug: 'bluesky-feed', file: '04-bluesky-feed.html',  mobile: false, settleMs: 1200 },
  { slug: 'mobile-field', file: '05-mobile-field.html',  mobile: true,  settleMs: 1500 },
];

// Desktop card aspect is 16:10; phone is 9:19.5 (~iPhone 14 Pro).
// 2× density so the WebP still looks crisp on Retina cards.
const DESKTOP_VP  = { width: 1440, height: 900 };
const MOBILE_VP   = { width: 390,  height: 844 };
const DEVICE_SCALE = 2;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const m of MOCKUPS) {
      const viewport = m.mobile ? MOBILE_VP : DESKTOP_VP;
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: DEVICE_SCALE,
      });
      const page = await context.newPage();
      const url = `file://${join(SRC_DIR, m.file)}`;
      console.log(`→ ${m.slug.padEnd(14)} ${viewport.width}x${viewport.height}@${DEVICE_SCALE}x  ${m.file}`);
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      // Let Leaflet / JS-driven animations settle; the dashboard
      // mockup pulls tiles from openstreetmap + GBIF.
      await page.waitForTimeout(m.settleMs);
      const outPath = join(OUT_DIR, `${m.slug}.webp`);
      // Playwright only emits png/jpeg — capture PNG in-memory,
      // then convert to WebP via sharp. Clip to viewport (no
      // full-page scroll) — cards display a "viewport-window"
      // of the mockup, not its full scroll length.
      const pngBuf = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      });
      await sharp(pngBuf).webp({ quality: 82 }).toFile(outPath);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${MOCKUPS.length} previews captured → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
