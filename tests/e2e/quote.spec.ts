import { test, expect } from '@playwright/test';

// The success/hand-off paths below need an API, so it is stubbed: the
// point under test is what the widget does with a created quote and its
// hand-off form, not what the endpoint returns.
const QUOTE_TOKEN = '11111111-1111-1111-1111-111111111111';

test('quote page renders with a default configuration and a live total', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build your quote');
  // Default: 100 barcoding specimens at the default commercial rate ($20).
  await expect(page.locator('[data-total]')).toHaveText('$2,000');
});

test('switching the rate switches the headline total', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('800');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total]')).toHaveText('$12,000'); // commercial default
  await expect(page.locator('[data-total-alt]')).toContainText('$9,600');
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-total]')).toHaveText('$9,600');
  await expect(page.locator('[data-total-alt]')).toContainText('$12,000');
});

test('the pay button names the amount and updates with configuration and rate', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('800');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-cta-pay]')).toContainText('$12,000');
  await expect(page.locator('[data-cta-amount]')).toHaveText('$12,000');
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-cta-amount]')).toHaveText('$9,600');
});

test('a dead-zone count auto-applies the better rate and shows headroom', async ({ page }) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.locator('[data-count-input="barcoding"]').fill('275');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total]')).toHaveText('$3,600');
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('25 more');
});

test('no comparative-price claim appears outside a dead zone', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  // 600 is not a dead zone for either audience, so the callout must be hidden.
  await expect(page.locator('[data-deadzone-callout]')).toBeHidden();
  const summary = await page.locator('[data-summary-panel]').innerText();
  expect(summary.toLowerCase()).not.toContain('less than');
  expect(summary.toLowerCase()).not.toContain('no extra cost');
});

test('a dead-zone count does make a comparative-price claim', async ({ page }) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.locator('[data-count-input="barcoding"]').fill('275');
  await page.locator('[data-count-input="barcoding"]').blur();
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('less than');
  await expect(callout).toContainText('no extra cost');
});

test('the conversation band swaps the CTA, hides the firm total, and collapses the pay/invoice CTAs', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('4000');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-conversation-notice]')).toBeVisible();
  // No firm price behind a high-volume quote, so pay/invoice would be
  // dishonest — only the email-me CTA survives, retitled.
  await expect(page.locator('[data-cta-pay]')).toBeHidden();
  await expect(page.locator('[data-cta-invoice]')).toBeHidden();
  await expect(page.locator('[data-pay-disclosure]')).toBeHidden();
  const emailCta = page.getByRole('button', { name: /Request a project quote/i });
  await expect(emailCta).toBeVisible();
  await expect(page.locator('[data-cta-email]')).toHaveText(/Request a project quote/);
});

test('eDNA markers change the total', async ({ page }) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.locator('[data-service-toggle="metabarcoding"]').check();
  await page.locator('[data-service-toggle="barcoding"]').uncheck();
  await page.locator('[data-count-input="metabarcoding"]').fill('100');
  await page.locator('[data-count-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total]')).toHaveText('$13,000');
  await page.locator('[data-markers-input="metabarcoding"]').fill('3');
  await page.locator('[data-markers-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total]')).toHaveText('$15,400');
});

test('the price is visible without submitting any form', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.locator('[data-total]')).toBeVisible();
  await expect(page.locator('#quote-name')).toBeHidden();
});

test('an out-of-range count is normalized on commit so display matches pricing', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  const input = page.locator('[data-count-input="barcoding"]');
  await input.fill('0');
  await input.blur();
  await expect(input).toHaveValue('1');
  await expect(page.locator('[data-total]')).toHaveText('$16');
});

test('a count where only the academic rate dead-zones claims a saving only on that rate', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.locator('[data-count-input="barcoding"]').fill('850');
  await page.locator('[data-count-input="barcoding"]').blur();
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('1,000–4,999');
  await expect(page.locator('[data-total]')).toHaveText('$10,000');
  // Commercial is NOT in a dead zone at 850, so it must not be claimed —
  // switching rates must hide the callout entirely. Only one total is
  // shown at a time now, so there is no audience name to get wrong; the
  // guarantee is that the OTHER rate never inherits this rate's claim.
  await page.check('[data-audience-toggle="commercial"]');
  await expect(callout).toBeHidden();
  await expect(page.locator('[data-total]')).toHaveText('$12,750');
});

test('an unknown quote token returns 404', async ({ page }) => {
  const res = await page.goto('/quote/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
});

test('unchecking every service hides the CTAs and disclosure; re-checking restores them', async ({
  page,
}) => {
  await page.goto('/quote');
  await expect(page.locator('[data-cta-pay]')).toBeVisible();
  await expect(page.locator('[data-cta-invoice]')).toBeVisible();
  await expect(page.locator('[data-cta-email]')).toBeVisible();
  await expect(page.locator('[data-pay-disclosure]')).toBeVisible();

  // Barcoding is the only service checked by default.
  await page.locator('[data-service-toggle="barcoding"]').uncheck();
  await expect(page.locator('[data-cta-pay]')).toBeHidden();
  await expect(page.locator('[data-cta-invoice]')).toBeHidden();
  await expect(page.locator('[data-cta-email]')).toBeHidden();
  await expect(page.locator('[data-pay-disclosure]')).toBeHidden();

  await page.locator('[data-service-toggle="barcoding"]').check();
  await expect(page.locator('[data-cta-pay]')).toBeVisible();
  await expect(page.locator('[data-cta-invoice]')).toBeVisible();
  await expect(page.locator('[data-cta-email]')).toBeVisible();
  await expect(page.locator('[data-pay-disclosure]')).toBeVisible();
});

test('the academic attestation appears only for the academic rate', async ({ page }) => {
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await expect(page.locator('[data-attest-field]')).toBeHidden();
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-attest-field]')).toBeVisible();
});

test('academic submit without the attestation is blocked with a visible message', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-pay]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');

  // The details form carries `novalidate`, so nothing but this app-level
  // check stands between an unattested academic submit and the server.
  let quoteRequested = false;
  await page.route('**/api/quote', (route) => {
    quoteRequested = true;
    return route.abort();
  });

  await page.click('[data-details-form] button[type="submit"]');

  const status = page.locator('[data-quote-status]');
  await expect(status).toBeVisible();
  await expect(status).toContainText(/confirm the academic-rate eligibility/i);
  expect(quoteRequested).toBe(false);
});

test('.bk-attest lays the checkbox beside its text, not stacked above it', async ({ page }) => {
  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-pay]');
  const attest = page.locator('[data-attest-field]');
  await expect(attest).toBeVisible();

  // The bug this guards against was a `flex-direction: column` on this
  // element — computed style is the authority, box geometry the proof.
  const flexDirection = await attest.evaluate((el) => getComputedStyle(el).flexDirection);
  expect(flexDirection).toBe('row');

  const checkboxBox = await attest.locator('input[type="checkbox"]').boundingBox();
  const textBox = await attest.locator('span').boundingBox();
  expect(checkboxBox).not.toBeNull();
  expect(textBox).not.toBeNull();

  // Side-by-side means their vertical extents overlap; a `column` bug would
  // put the text's top at or below the checkbox's bottom edge, with no
  // overlap at all.
  const checkboxBottom = checkboxBox!.y + checkboxBox!.height;
  const textBottom = textBox!.y + textBox!.height;
  const overlap = Math.min(checkboxBottom, textBottom) - Math.max(checkboxBox!.y, textBox!.y);
  expect(overlap).toBeGreaterThan(0);
  // And the checkbox reads to the left of its text, not above it.
  expect(checkboxBox!.x).toBeLessThan(textBox!.x);
});

test('the PO field appears only on the invoice path', async ({ page }) => {
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await expect(page.locator('[data-po-field]')).toBeHidden();
  await page.click('[data-cta-invoice]');
  await expect(page.locator('[data-po-field]')).toBeVisible();
});

test('the /api/quote payload sends attest as a boolean; the hand-off form sends it as the string "true"', async ({
  page,
}) => {
  let quoteBody: { attest?: unknown; audience?: unknown } | null = null;
  await page.route('**/api/quote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    quoteBody = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      json: {
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: `/quote/${QUOTE_TOKEN}`,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      },
    });
  });
  let payBody: string | null = null;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (route) => {
    payBody = route.request().postData();
    return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });

  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-pay]');
  await page.check('[data-attest-field] input[type="checkbox"]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');

  await expect.poll(() => payBody).not.toBeNull();
  expect(typeof quoteBody?.attest).toBe('boolean');
  expect(quoteBody?.attest).toBe(true);
  const params = new URLSearchParams(payBody ?? '');
  expect(params.get('attest')).toBe('true');
});

test('the attest value agrees across a rate switch — ticked on academic, submitted as commercial', async ({
  page,
}) => {
  let quoteBody: { attest?: unknown; audience?: unknown } | null = null;
  await page.route('**/api/quote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    quoteBody = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      json: {
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: `/quote/${QUOTE_TOKEN}`,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      },
    });
  });
  let payBody: string | null = null;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (route) => {
    payBody = route.request().postData();
    return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });

  await page.goto('/quote');
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-pay]');
  await page.check('[data-attest-field] input[type="checkbox"]');
  // Switch to commercial without unchecking attest — the rate, not the
  // stale checkbox state, must decide what gets sent.
  await page.check('[data-audience-toggle="commercial"]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');

  await expect.poll(() => payBody).not.toBeNull();
  expect(quoteBody?.audience).toBe('commercial');
  expect(quoteBody?.attest).toBe(false);
  const params = new URLSearchParams(payBody ?? '');
  expect(params.get('audience')).toBe('commercial');
  // Both payloads agree: no academic attestation claimed for a commercial submit.
  expect(params.get('attest')).toBe('');
});

test('paying chains the quote post into the pay endpoint', async ({ page }) => {
  // Same route-stub pattern the old deposit-invalidation test used.
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  let payPost: string | null = null;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (r) => {
    payPost = r.request().postData();
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await expect.poll(() => payPost).toContain('intent=pay');
  expect(payPost).toContain('audience=commercial');
});

test('the email-me path creates a quote and does NOT hand off to payment', async ({ page }) => {
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  let payCalls = 0;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (r) => {
    payCalls += 1;
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });
  await page.goto('/quote');
  await page.click('[data-cta-email]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001');
  expect(payCalls).toBe(0);
});

test('changing the configuration while the quote request is in flight does not chain a stale hand-off', async ({
  page,
}) => {
  await page.route('**/api/quote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    // Give the test a window to change the configuration before the
    // response — and the widget's in-flight signature check — resolve.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({
      json: {
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: `/quote/${QUOTE_TOKEN}`,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      },
    });
  });
  let payCalls = 0;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (route) => {
    payCalls += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });

  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');

  // The POST above is still pending — change what's configured before it
  // resolves. The old token/amount must not be posted for this new config.
  await page.locator('[data-count-input="barcoding"]').fill('850');
  await page.locator('[data-count-input="barcoding"]').blur();

  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001', {
    timeout: 3000,
  });
  expect(payCalls).toBe(0);
});

// ── GA4 funnel events ──────────────────────────────────────────────────
// The widget fires events only through window.gtag?.() — the host page
// owns the tag. These stub gtag before the widget mounts and assert the
// three funnel events; absent gtag must be a silent no-op (covered by
// every other test in this file running without a stub and not crashing).

// Installed AFTER page load: BaseLayout's real GA bootstrap overwrites
// window.gtag at parse time, so an addInitScript stub gets clobbered. The
// widget resolves window.gtag at call time, so a post-load stub catches
// everything fired by subsequent interactions.
const installGaStub = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    (window as unknown as { __ga: unknown[][] }).__ga = [];
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) =>
      (window as unknown as { __ga: unknown[][] }).__ga.push(a);
  });
const gaEvents = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __ga: unknown[][] }).__ga);

test('quote_widget_engaged fires once, on first input', async ({ page }) => {
  await page.goto('/quote');
  await installGaStub(page);
  await page.fill('[data-count-input="barcoding"]', '300');
  await page.fill('[data-count-input="barcoding"]', '800');
  const events = await gaEvents(page);
  const engaged = events.filter((e) => e[1] === 'quote_widget_engaged');
  expect(engaged).toHaveLength(1);
  expect(engaged[0][2]).toEqual({ source: 'site' });
});

test('quote_created fires with the chosen rate as value', async ({ page }) => {
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  await page.goto('/quote');
  await installGaStub(page);
  await page.fill('[data-count-input="barcoding"]', '800');
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-email]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001');
  const events = await gaEvents(page);
  const created = events.filter((e) => e[1] === 'quote_created');
  expect(created).toHaveLength(1);
  expect(created[0][2]).toEqual({ source: 'site', currency: 'USD', value: 9600 });
});

test('begin_checkout fires with the full amount before the hand-off navigates', async ({
  page,
}) => {
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  // The hand-off is a real form navigation, which replaces the document and
  // takes window.__ga with it — so this stub records into sessionStorage,
  // which survives same-origin navigation. Landing on the fulfilled stub
  // page at all proves the event fired before the browser left.
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub checkout</title>' }),
  );
  await page.goto('/quote');
  await page.evaluate(() => {
    sessionStorage.setItem('__ga', '[]');
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) => {
      const all = JSON.parse(sessionStorage.getItem('__ga') ?? '[]') as unknown[][];
      all.push(a);
      sessionStorage.setItem('__ga', JSON.stringify(all));
    };
  });
  await page.fill('[data-count-input="barcoding"]', '800');
  await page.click('[data-cta-pay]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await page.waitForURL(`**/api/quote/${QUOTE_TOKEN}/pay`);
  const events = (await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('__ga') ?? '[]'),
  )) as unknown[][];
  const checkout = events.filter((e) => e[1] === 'begin_checkout');
  expect(checkout).toHaveLength(1);
  // Commercial default: 800 barcoding @ $15 = $12,000 — the FULL amount,
  // not a deposit (deposit_continue is dead; customers pay 100% now).
  expect(checkout[0][2]).toEqual({ source: 'site', currency: 'USD', value: 12000 });
});
