import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The bundle has to run on the Shopify store, where none of biokea.ai's
// CSS, fonts, or scripts exist. These tests stand up a fake store origin
// whose entire page is the mount div plus the widget's own two files,
// served from a second (also fake) origin — exactly the Shopify Custom
// Liquid embed. If the bundle were not self-contained, nothing here would
// render: no other request is allowed to succeed.
//
// The files are served from disk rather than from the dev server because
// `astro dev` (Vite, with server.cors disabled — see astro.config.mjs) 403s
// cross-site subresource requests. Production static assets do not.
const STORE = 'http://store.biokea.test';
const ASSETS = 'http://assets.biokea.test';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../public/widget/${name}`, import.meta.url)), 'utf8');

async function embed(page: Page, source?: string): Promise<void> {
  await page.route(`${ASSETS}/widget/quote.css`, (route) =>
    route.fulfill({ contentType: 'text/css', body: read('quote.css') }),
  );
  await page.route(`${ASSETS}/widget/quote.js`, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: read('quote.js') }),
  );
  const attr = source ? ` data-source="${source}"` : '';
  await page.route(`${STORE}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        `<!doctype html><html><head><meta charset="utf-8">` +
        `<link rel="stylesheet" href="${ASSETS}/widget/quote.css"></head><body>` +
        `<div id="quote-widget"${attr}></div>` +
        `<script src="${ASSETS}/widget/quote.js" defer></script></body></html>`,
    }),
  );
  await page.goto(`${STORE}/products/sequencing`);
}

test('the widget bundle mounts and prices itself off-site', async ({ page }) => {
  await embed(page, 'store');

  // Default configuration: 100 specimens of barcoding at the $16 academic rate.
  await expect(page.locator('[data-total-academic]')).toHaveText('$1,600');
  await expect(page.locator('[data-total-commercial]')).toHaveText('$2,000');
  await expect(page.locator('[data-summary-panel]')).toBeVisible();
  await expect(page.locator('[data-deposit-panel]')).toBeHidden();
  expect(
    await page.evaluate(
      () => typeof (window as { BioKEAQuote?: { mount?: unknown } }).BioKEAQuote?.mount,
    ),
  ).toBe('function');
});

test('the widget recalculates from its own controls off-site', async ({ page }) => {
  await embed(page);

  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$7,200');
});
