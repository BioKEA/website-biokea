import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// The success/hand-off paths below need an API, so it is stubbed: the
// point under test is what the widget does with a created quote and its
// hand-off form, not what the endpoint returns.
const QUOTE_TOKEN = '11111111-1111-1111-1111-111111111111';

// Quote pages need a persisted quote, which needs Supabase env (.dev.vars).
// Probe once; skip (not fail) where the API reports it is not configured.
async function createQuote(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ token: string } | null> {
  const res = await request.post('/api/quote', {
    data: {
      name: 'Ada',
      email: 'ada@example.org',
      audience: 'commercial',
      source: 'site',
      ...data,
    },
  });
  const body = await res.json();
  if (!res.ok() && /not configured/i.test(String(body.error))) return null;
  expect(res.ok(), JSON.stringify(body)).toBe(true);
  return { token: body.token };
}

type QuoteBody = Record<string, unknown> & { config?: Record<string, unknown> };

/** Stubs POST /api/quote; returns the bodies it received. */
async function stubQuote(
  page: Page,
  reply: Record<string, unknown> = {},
  delayMs = 0,
): Promise<QuoteBody[]> {
  const bodies: QuoteBody[] = [];
  await page.route('**/api/quote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.fulfill({
      json: {
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: `/quote/${QUOTE_TOKEN}`,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
        consult: false,
        ...reply,
      },
    });
  });
  return bodies;
}

/** Stubs the pay endpoint; returns the urlencoded bodies posted to it. */
async function stubPay(page: Page): Promise<string[]> {
  const posts: string[] = [];
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (route) => {
    posts.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' });
  });
  return posts;
}

const branch = (page: Page, slug: string) => page.locator(`[data-branch="${slug}"]`);
const field = (page: Page, slug: string, name: string, value?: string) =>
  branch(page, slug).locator(
    `[data-field="${name}"]${value === undefined ? '' : `[value="${value}"]`}`,
  );

/** The spec's eDNA example: 60 water samples, vertebrates (12S suggested)
 * plus COI — $10,500 at the commercial rate. */
async function ednaPath(page: Page, samples = '60'): Promise<void> {
  await page.locator('[data-service-choice="metabarcoding"]').check();
  await field(page, 'metabarcoding', 'targets', 'vertebrates').check();
  await expect(field(page, 'metabarcoding', 'markers', '12S')).toBeChecked();
  await field(page, 'metabarcoding', 'markers', 'COI').check();
  await field(page, 'metabarcoding', 'sampleType').selectOption('water');
  await field(page, 'metabarcoding', 'samples').fill(samples);
}

async function fillDetails(page: Page): Promise<void> {
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
}
const submit = (page: Page) => page.click('[data-details-form] button[type="submit"]');

test('nothing is selected on load: menu only, no branch, no quote panel', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.locator('[data-service-choice]')).toHaveCount(4);
  await expect(page.locator('[data-service-choice]:checked')).toHaveCount(0);
  for (const slug of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna']) {
    await expect(branch(page, slug)).toBeHidden();
  }
  await expect(page.locator('[data-step="directions"]')).toBeHidden();
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  await expect(page.locator('[data-form-status]')).toBeHidden();
});

test('?service=metagenomics pre-selects that service and shows its branch', async ({ page }) => {
  await page.goto('/quote?service=metagenomics');
  await expect(page.locator('[data-service-choice="metagenomics"]')).toBeChecked();
  await expect(branch(page, 'metagenomics')).toBeVisible();
  await expect(branch(page, 'barcoding')).toBeHidden();
  await expect(page.locator('[data-step="directions"]')).toBeVisible();
});

test('?service=nonsense renders the menu with nothing selected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/quote?service=nonsense');
  await expect(page.locator('[data-service-choice]')).toHaveCount(4);
  await expect(page.locator('[data-service-choice]:checked')).toHaveCount(0);
  await expect(page.locator('[data-branch]:visible')).toHaveCount(0);
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('picking barcoding reveals handling, target, markers, sample type, samples, selection', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-service-choice="barcoding"]').check();
  await expect(branch(page, 'barcoding')).toBeVisible();
  await expect(field(page, 'barcoding', 'handling', 'voucher')).toBeChecked();
  await expect(field(page, 'barcoding', 'target')).toBeVisible();
  // Barcoding suggests COI before any target is chosen.
  await expect(field(page, 'barcoding', 'markers', 'COI')).toBeChecked();
  await expect(field(page, 'barcoding', 'sampleType')).toBeVisible();
  await expect(field(page, 'barcoding', 'samples')).toBeVisible();
  await expect(field(page, 'barcoding', 'perSampleOn')).toBeChecked();
  await expect(field(page, 'barcoding', 'perSample')).toBeVisible();
  await expect(field(page, 'barcoding', 'uniqueOn')).toBeVisible();

  // 3 water samples × up to 50 invertebrates, COI: 150 specimens priced.
  await field(page, 'barcoding', 'target').selectOption('invertebrates');
  await expect(branch(page, 'barcoding').locator('[data-subs-for="invertebrates"]')).toBeVisible();
  await field(page, 'barcoding', 'sampleType').selectOption('water');
  await field(page, 'barcoding', 'samples').fill('3');
  await field(page, 'barcoding', 'perSample').fill('50');
  await expect(branch(page, 'barcoding').locator('[data-per-sample-hint]')).toContainText(
    'up to 150 specimens',
  );
  await expect(page.locator('[data-status-pill]')).toHaveText('Ready for checkout');
});

test('vertebrates reveals the material fieldset and the no-harm notice', async ({ page }) => {
  await page.goto('/quote?service=barcoding');
  const material = branch(page, 'barcoding').locator(
    '[data-show-when="target=vertebrates"]:not([data-subs-for])',
  );
  await expect(material).toBeHidden();
  await field(page, 'barcoding', 'target').selectOption('vertebrates');
  await expect(material).toBeVisible();
  await expect(material).toContainText('don’t harm live animals');
  await expect(field(page, 'barcoding', 'material', 'swabs')).toBeVisible();
  await field(page, 'barcoding', 'target').selectOption('fungi');
  await expect(material).toBeHidden();
});

test('eDNA: 60 water samples, vertebrates → 12S suggested; adding COI prices $10,500 commercial', async ({
  page,
}) => {
  await page.goto('/quote');
  await ednaPath(page);
  await expect(page.locator('[data-total]')).toHaveText('$10,500');
  await expect(page.locator('[data-status-pill]')).toHaveText('Ready for checkout');
  await expect(page.locator('[data-cta-amount]')).toHaveText('$10,500');
  // Editing the markers stops the auto-suggestion and says so.
  await expect(branch(page, 'metabarcoding').locator('[data-marker-suggest]')).toContainText(
    'differs from the suggestion',
  );
});

test('switching the rate switches the headline total', async ({ page }) => {
  await page.goto('/quote');
  await ednaPath(page);
  await expect(page.locator('[data-total]')).toHaveText('$10,500');
  await expect(page.locator('[data-total-alt]')).toContainText('$8,520');
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-total]')).toHaveText('$8,520');
  await expect(page.locator('[data-total-alt]')).toContainText('$10,500');
  await expect(page.locator('[data-cta-amount]')).toHaveText('$8,520');
});

test('a dead-zone eDNA count shows the headroom callout', async ({ page }) => {
  await page.goto('/quote?service=metabarcoding');
  await field(page, 'metabarcoding', 'targets', 'vertebrates').check();
  await field(page, 'metabarcoding', 'sampleType').selectOption('water');
  // 45 × $205 = $9,225 > 49 × $160 = $7,840, so the 49+ tier applies.
  await field(page, 'metabarcoding', 'samples').fill('45');
  await expect(page.locator('[data-total]')).toHaveText('$7,840');
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('less than 45 samples');
  await expect(callout).toContainText('4 more at no extra cost');
});

test('ticking kits turns the panel into consult with a "Sampling kits (60)" trigger', async ({
  page,
}) => {
  await page.goto('/quote');
  await ednaPath(page);
  await field(page, 'metabarcoding', 'kits').check();
  await expect(page.locator('[data-status-pill]')).toHaveText('Consultation needed before payment');
  await expect(page.locator('[data-trigger-list]')).toContainText('Sampling kits (60)');
  await expect(page.locator('[data-tbc]')).toContainText('To be confirmed');
  await expect(page.locator('[data-cta-consult]')).toBeVisible();
  await expect(page.locator('[data-cta-pay]')).toHaveCount(0);
});

test('ticking "Other" marker then unticking it leaves no trigger and restores the pay CTA', async ({
  page,
}) => {
  await page.goto('/quote');
  await ednaPath(page);
  const other = field(page, 'metabarcoding', 'markers', 'other');
  await other.check();
  // "Which marker?" is required once Other is ticked: the panel goes, and
  // the inline error appears once that field has been touched.
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  await expect(page.locator('[data-form-status]')).toHaveText(
    'Finish the highlighted fields to see your quote.',
  );
  const markerOtherErr = branch(page, 'metabarcoding').locator('[data-error-for="markerOther"]');
  await expect(markerOtherErr).toBeHidden();
  await field(page, 'metabarcoding', 'markerOther').focus();
  await field(page, 'metabarcoding', 'markerOther').blur();
  await expect(markerOtherErr).toHaveText('Tell us which marker you need.');
  await field(page, 'metabarcoding', 'markerOther').fill('rbcL');
  await expect(page.locator('[data-trigger-list]')).toContainText('Marker: Other');
  await expect(page.locator('[data-cta-pay]')).toHaveCount(0);

  await other.uncheck();
  await expect(page.locator('[data-trigger-list]')).toHaveCount(0);
  await expect(page.locator('[data-status-pill]')).toHaveText('Ready for checkout');
  await expect(page.locator('[data-cta-pay]')).toBeVisible();
  await expect(page.locator('[data-total]')).toHaveText('$10,500');
});

test('metagenomics: MG+MT on 2 specimens = $14,400; environmental source adds a consult trigger', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-service-choice="metagenomics"]').check();
  await field(page, 'metagenomics', 'assays', 'mg').check();
  await field(page, 'metagenomics', 'assays', 'mt').check();
  await field(page, 'metagenomics', 'count').fill('2');
  await expect(page.locator('[data-total]')).toHaveText('$14,400');
  await expect(page.locator('[data-status-pill]')).toHaveText('Ready for checkout');

  await field(page, 'metagenomics', 'source', 'environmental').check();
  await expect(branch(page, 'metagenomics').locator('[data-count-label]')).toHaveText(
    'Number of environmental samples',
  );
  // The description is now required: no quote until it's filled, and its
  // inline error waits until the field is touched.
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  const envErr = branch(page, 'metagenomics').locator('[data-error-for="envNotes"]');
  await expect(envErr).toBeHidden();
  await field(page, 'metagenomics', 'envNotes').focus();
  await field(page, 'metagenomics', 'envNotes').blur();
  await expect(envErr).toBeVisible();
  await field(page, 'metagenomics', 'envNotes').fill('Pond water, frozen');
  await expect(page.locator('[data-trigger-list]')).toContainText('Environmental samples');
  await expect(page.locator('[data-total]')).toHaveText('$14,400');
  await expect(page.locator('[data-cta-consult]')).toBeVisible();
  await expect(page.locator('[data-cta-pay]')).toHaveCount(0);
});

test('qPCR shows the custom intake and "Custom quote after consultation" with only the consult CTA', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-service-choice="targeted-edna"]').check();
  await expect(field(page, 'targeted-edna', 'species')).toBeVisible();
  await expect(field(page, 'targeted-edna', 'measure', 'unsure')).toBeChecked();
  await field(page, 'targeted-edna', 'species').fill('Dreissena polymorpha');
  await field(page, 'targeted-edna', 'qSampleType').selectOption('Water');
  await expect(page.locator('[data-status-pill]')).toHaveText('Custom quote after consultation');
  await expect(page.locator('[data-total]')).toHaveCount(0);
  await expect(page.locator('[data-cta-consult]')).toBeVisible();
  await expect(page.locator('[data-cta-pay], [data-cta-invoice], [data-cta-email]')).toHaveCount(0);
});

test('a freshly opened branch shows no inline errors until a field is touched', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-service-choice="barcoding"]').check();
  const errs = branch(page, 'barcoding').locator('[data-error-for]');
  expect(await errs.count()).toBeGreaterThan(0);
  for (const err of await errs.all()) await expect(err).toBeHidden();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  // Untouched but incomplete: still no quote, and the status line says why.
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  await expect(page.locator('[data-form-status]')).toHaveText(
    'Finish the highlighted fields to see your quote.',
  );

  await field(page, 'barcoding', 'samples').fill('0');
  await expect(branch(page, 'barcoding').locator('[data-error-for]:visible')).toHaveCount(1);
  await expect(branch(page, 'barcoding').locator('[data-error-for="samples"]')).toHaveText(
    'Enter how many samples you’ll send.',
  );
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(1);
  await expect(field(page, 'barcoding', 'samples')).toHaveAttribute('aria-invalid', 'true');
});

test('a missing required field hides the panel and shows the inline error', async ({ page }) => {
  await page.goto('/quote');
  await ednaPath(page);
  await expect(page.locator('[data-quote-panel]')).toBeVisible();
  await field(page, 'metabarcoding', 'samples').fill('');
  await expect(page.locator('[data-quote-panel]')).toBeHidden();
  const err = branch(page, 'metabarcoding').locator('[data-error-for="samples"]');
  await expect(err).toBeVisible();
  await expect(err).toHaveText('Enter the number of samples as a whole number.');
  await expect(field(page, 'metabarcoding', 'samples')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-form-status]')).toHaveText(
    'Finish the highlighted fields to see your quote.',
  );
  await field(page, 'metabarcoding', 'samples').fill('60');
  await expect(err).toBeHidden();
  await expect(page.locator('[data-form-status]')).toBeHidden();
  await expect(page.locator('[data-total]')).toHaveText('$10,500');
});

test('the academic attestation appears only for the academic rate on pay/invoice', async ({
  page,
}) => {
  await page.goto('/quote');
  await ednaPath(page);
  await page.click('[data-cta-pay]');
  const attest = page.locator('[data-attest-field]');
  await expect(attest).toBeHidden();
  await page.check('[data-audience-toggle="academic"]');
  await expect(attest).toBeVisible();
  await page.click('[data-cta-invoice]');
  await expect(attest).toBeVisible();
  await page.click('[data-cta-email]');
  await expect(attest).toBeHidden();

  // The form is `novalidate`, so an unattested academic pay submit is
  // blocked by the widget itself, before anything is sent.
  const bodies = await stubQuote(page);
  await page.click('[data-cta-pay]');
  await fillDetails(page);
  await submit(page);
  await expect(page.locator('[data-quote-status]')).toContainText(
    /confirm the academic-rate eligibility/i,
  );
  expect(bodies).toHaveLength(0);

  // Kits make it a consult: no attestation there either.
  await field(page, 'metabarcoding', 'kits').check();
  await page.click('[data-cta-consult]');
  await expect(attest).toBeHidden();
});

test('the PO field appears only on the invoice path', async ({ page }) => {
  await page.goto('/quote');
  await ednaPath(page);
  await page.click('[data-cta-pay]');
  await expect(page.locator('[data-po-field]')).toBeHidden();
  await page.click('[data-cta-invoice]');
  await expect(page.locator('[data-po-field]')).toBeVisible();
  await page.click('[data-cta-email]');
  await expect(page.locator('[data-po-field]')).toBeHidden();
});

test('paying chains the quote post (with config, no lines) into the pay endpoint', async ({
  page,
}) => {
  const bodies = await stubQuote(page);
  const pays = await stubPay(page);
  await page.goto('/quote');
  await ednaPath(page);
  await page.locator('[data-step="directions"] [data-field="directions"]').fill('Filter on site.');
  await page.click('[data-cta-pay]');
  await fillDetails(page);
  await submit(page);
  await expect.poll(() => pays.length).toBe(1);

  const body = bodies[0];
  expect(body).not.toHaveProperty('lines');
  expect(body).not.toHaveProperty('note');
  expect(body.directions).toBe('Filter on site.');
  expect(body.audience).toBe('commercial');
  expect(body.attest).toBe(false);
  expect(body.source).toBe('site');
  expect(body.config).toEqual({
    service: 'metabarcoding',
    targets: ['vertebrates'],
    markers: ['COI', '12S'],
    sampleType: 'water',
    samples: 60,
    kits: false,
    directions: 'Filter on site.',
  });
  const params = new URLSearchParams(pays[0]);
  expect(params.get('intent')).toBe('pay');
  expect(params.get('audience')).toBe('commercial');
});

test('the email-me path creates a quote and does NOT hand off', async ({ page }) => {
  const bodies = await stubQuote(page);
  const pays = await stubPay(page);
  await page.goto('/quote');
  await ednaPath(page);
  await page.click('[data-cta-email]');
  await fillDetails(page);
  await submit(page);
  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001');
  expect(bodies).toHaveLength(1);
  expect(pays).toHaveLength(0);
  await expect(page.locator('[data-handoff-form]')).not.toHaveAttribute('action', /.+/);
});

test('the consult path posts the config and shows the reference without a hand-off', async ({
  page,
}) => {
  const bodies = await stubQuote(page, { consult: true });
  const pays = await stubPay(page);
  await page.goto('/quote');
  await ednaPath(page);
  await field(page, 'metabarcoding', 'kits').check();
  await page.check('[data-audience-toggle="academic"]');
  await page.click('[data-cta-consult]');
  await expect(page.locator('[data-attest-field]')).toBeHidden();
  await expect(page.locator('[data-po-field]')).toBeHidden();
  await fillDetails(page);
  await submit(page);

  const status = page.locator('[data-quote-status]');
  await expect(status).toContainText(
    "Consultation requested — we'll reply with a firm quote. Your reference is BK-2026-0001.",
  );
  await expect(status.locator('a')).toHaveAttribute('href', `/quote/${QUOTE_TOKEN}`);
  await expect(page.locator('[data-status-pill]')).toHaveText('Consultation requested');
  expect(bodies).toHaveLength(1);
  expect(bodies[0].config).toMatchObject({ service: 'metabarcoding', kits: true, samples: 60 });
  expect(bodies[0].attest).toBe(false);
  expect(pays).toHaveLength(0);
});

test('changing the configuration while the request is in flight does not chain a stale hand-off', async ({
  page,
}) => {
  await stubQuote(page, {}, 500);
  const pays = await stubPay(page);
  await page.goto('/quote');
  await ednaPath(page);
  await page.click('[data-cta-pay]');
  await fillDetails(page);
  await submit(page);
  // The POST above is still pending — change what's configured before it
  // resolves. The old token/amount must not be posted for this new config.
  await field(page, 'metabarcoding', 'samples').fill('80');
  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001', {
    timeout: 3000,
  });
  // Give a (regressed) hand-off time to navigate before asserting it didn't.
  await page.waitForTimeout(500);
  expect(pays).toHaveLength(0);
  await expect(page.locator('[data-handoff-form]')).not.toHaveAttribute('action');
  expect(new URL(page.url()).pathname).toMatch(/\/quote$/);
});

/** Presses Tab until `selector` has focus (or gives up). */
async function tabTo(page: Page, selector: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`never reached ${selector} by Tab`);
}

test('keyboard-only: tab through the eDNA path to the pay CTA', async ({ page }) => {
  await page.goto('/quote');
  await tabTo(page, '[data-service-choice]');
  await page.keyboard.press('ArrowRight'); // barcoding → eDNA metabarcoding
  await expect(page.locator('[data-service-choice="metabarcoding"]')).toBeChecked();

  const b = '[data-branch="metabarcoding"]';
  await tabTo(page, `${b} [data-field="targets"][value="vertebrates"]`);
  await page.keyboard.press('Space');
  await tabTo(page, `${b} [data-field="markers"][value="COI"]`);
  await page.keyboard.press('Space');
  await tabTo(page, `${b} [data-field="sampleType"]`);
  await page.keyboard.type('Water');
  await expect(field(page, 'metabarcoding', 'sampleType')).toHaveValue('water');
  await tabTo(page, `${b} [data-field="samples"]`);
  await page.keyboard.type('60');
  await tabTo(page, '[data-cta-pay]');
  await expect(page.locator('[data-total]')).toHaveText('$10,500');
  await page.keyboard.press('Enter');
  await expect(page.locator('#quote-name')).toBeFocused();
});

test('phone width: no horizontal scroll with the barcoding branch open', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/quote?service=barcoding');
  await field(page, 'barcoding', 'target').selectOption('vertebrates');
  await field(page, 'barcoding', 'sampleType').selectOption('other');
  await expect(branch(page, 'barcoding').locator('[data-subs-for="vertebrates"]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// ── GA4 funnel events ──────────────────────────────────────────────────
// The widget fires events only through window.gtag?.() — the host page
// owns the tag. The stub is installed AFTER page load (BaseLayout's GA
// bootstrap overwrites window.gtag at parse time) and records into
// sessionStorage, which survives the hand-off's same-origin navigation.
test('quote_widget_engaged, quote_created, begin_checkout fire as before', async ({ page }) => {
  await stubQuote(page);
  await stubPay(page);
  await page.goto('/quote');
  await page.evaluate(() => {
    sessionStorage.setItem('__ga', '[]');
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) => {
      const all = JSON.parse(sessionStorage.getItem('__ga') ?? '[]') as unknown[][];
      all.push(a);
      sessionStorage.setItem('__ga', JSON.stringify(all));
    };
  });
  await ednaPath(page);
  await page.click('[data-cta-pay]');
  await fillDetails(page);
  await submit(page);
  await page.waitForURL(`**/api/quote/${QUOTE_TOKEN}/pay`);
  const events = (await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('__ga') ?? '[]'),
  )) as unknown[][];
  const named = (n: string) => events.filter((e) => e[1] === n).map((e) => e[2]);
  expect(named('quote_widget_engaged')).toEqual([{ source: 'site' }]);
  expect(named('quote_created')).toEqual([{ source: 'site', currency: 'USD', value: 10500 }]);
  expect(named('begin_checkout')).toEqual([{ source: 'site', currency: 'USD', value: 10500 }]);
});

test('an unknown quote token returns 404', async ({ page }) => {
  const res = await page.goto('/quote/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
});

test('a consult quote page shows the request, the triggers, the directions, and no pay panel', async ({
  page,
  request,
}) => {
  const created = await createQuote(request, {
    directions: 'Filter on site.',
    config: {
      service: 'targeted-edna',
      species: 'Dreissena',
      measure: 'both',
      assayExists: 'no',
      sampleType: 'water',
    },
  });
  test.skip(!created, 'quote API not configured in this environment (no .dev.vars)');
  const { token } = created!;
  await page.goto(`/quote/${token}`);
  await expect(page.locator('[data-consult-notice]')).toContainText('Consultation requested');
  await expect(page.locator('[data-consult-notice]')).toContainText('Dreissena');
  await expect(page.locator('[data-directions]')).toContainText('Filter on site.');
  await expect(page.locator('#pay')).toHaveCount(0);
});
test('a priced config quote page lists the configuration beside the lines', async ({
  page,
  request,
}) => {
  const created = await createQuote(request, {
    config: {
      service: 'metabarcoding',
      targets: ['vertebrates'],
      markers: ['12S', 'COI'],
      sampleType: 'water',
      samples: 60,
      kits: false,
    },
  });
  test.skip(!created, 'quote API not configured in this environment (no .dev.vars)');
  const { token } = created!;
  await page.goto(`/quote/${token}`);
  await expect(page.locator('[data-config-summary]')).toContainText('Markers: 12S, COI');
  await expect(page.getByText('$10,500').first()).toBeVisible();
});
