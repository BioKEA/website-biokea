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

// Turnstile renders `.cf-turnstile` elements when its script loads. A widget
// mounted after that has already happened would otherwise show a dead box.
test('a late mount renders Turnstile explicitly when the API is already loaded', async ({
  page,
}) => {
  await embed(page);

  const result = await page.evaluate(() => {
    const calls: string[] = [];
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (el: HTMLElement, opts: { sitekey: string }) => {
        calls.push(opts.sitekey);
        el.setAttribute('data-rendered', '1');
        return 'widget-1';
      },
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const widget = (
      window as unknown as {
        BioKEAQuote: { mount(el: HTMLElement, o: Record<string, unknown>): { destroy(): void } };
      }
    ).BioKEAQuote.mount(host, { turnstileSiteKey: '1x00000000000000000000AA' });
    const out = {
      calls,
      marked: host.querySelector('.cf-turnstile')?.getAttribute('data-rendered') ?? null,
      injectedScripts: document.querySelectorAll('script[src*="challenges.cloudflare.com"]').length,
    };
    widget.destroy();
    return out;
  });

  expect(result.calls).toEqual(['1x00000000000000000000AA']);
  expect(result.marked).toBe('1');
  // The API was already there, so no second copy of the script.
  expect(result.injectedScripts).toBe(0);
});

test('destroy() releases the mount element so it can be mounted again', async ({ page }) => {
  await embed(page);

  expect(
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.dataset.bkMounted = '1';
      document.body.appendChild(host);
      const api = (
        window as unknown as {
          BioKEAQuote: { mount(el: HTMLElement): { destroy(): void } };
        }
      ).BioKEAQuote;
      api.mount(host).destroy();
      return { flag: host.dataset.bkMounted ?? null, html: host.innerHTML };
    }),
  ).toEqual({ flag: null, html: '' });
});
