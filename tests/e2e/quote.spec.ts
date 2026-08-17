import { test, expect } from '@playwright/test';

test('quote page renders with a default configuration and a live total', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build your quote');
  await expect(page.locator('[data-total-academic]')).not.toBeEmpty();
});

test('changing the specimen count updates the total live', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$7,200');
  await expect(page.locator('[data-total-commercial]')).toHaveText('$9,000');
});

test('a dead-zone count auto-applies the better rate and shows headroom', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('275');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$3,600');
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
  await page.locator('[data-count-input="barcoding"]').fill('275');
  await page.locator('[data-count-input="barcoding"]').blur();
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('less than');
  await expect(callout).toContainText('no extra cost');
});

test('the conversation band swaps the CTA and hides the firm total', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('4000');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-conversation-notice]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Request a project quote/i })).toBeVisible();
});

test('eDNA markers change the total', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-service-toggle="metabarcoding"]').check();
  await page.locator('[data-service-toggle="barcoding"]').uncheck();
  await page.locator('[data-count-input="metabarcoding"]').fill('100');
  await page.locator('[data-count-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$13,000');
  await page.locator('[data-markers-input="metabarcoding"]').fill('3');
  await page.locator('[data-markers-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$15,400');
});

test('the price is visible without submitting any form', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.locator('[data-total-academic]')).toBeVisible();
  await expect(page.locator('#quote-name')).toBeHidden();
});

test('an out-of-range count is normalized on commit so display matches pricing', async ({
  page,
}) => {
  await page.goto('/quote');
  const input = page.locator('[data-count-input="barcoding"]');
  await input.fill('0');
  await input.blur();
  await expect(input).toHaveValue('1');
  await expect(page.locator('[data-total-academic]')).toHaveText('$16');
});

test('a count where only the academic rate dead-zones names that rate explicitly', async ({
  page,
}) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('850');
  await page.locator('[data-count-input="barcoding"]').blur();
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('Academic/nonprofit');
  // Commercial is NOT in a dead zone at 850, so it must not be claimed.
  await expect(callout).not.toContainText('Commercial:');
  await expect(page.locator('[data-total-academic]')).toHaveText('$10,000');
  await expect(page.locator('[data-total-commercial]')).toHaveText('$12,750');
});

test('an unknown quote token returns 404', async ({ page }) => {
  const res = await page.goto('/quote/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
});

test('the deposit panel is hidden until a quote is created', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.locator('[data-total-academic]')).not.toBeEmpty();
  await expect(page.locator('[data-deposit-panel]')).toBeHidden();
});

// The success path needs an API, so it is stubbed: the point under test is
// what the widget does with a created quote, not what the endpoint returns.
const QUOTE_TOKEN = '11111111-1111-1111-1111-111111111111';

test('a created deposit panel is retired when the configuration changes', async ({ page }) => {
  await page.route('**/api/quote', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        ok: true,
        quoteNumber: 'BK-1',
        url: `https://biokea.ai/quote/${QUOTE_TOKEN}`,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      },
    });
  });
  await page.goto('/quote');

  await page.locator('[data-open-form]').click();
  await page.locator('#quote-name').fill('Test Person');
  await page.locator('#quote-email').fill('test@example.com');
  await page.locator('[data-quote-form] button[type="submit"]').click();

  const panel = page.locator('[data-deposit-panel]');
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-quote-status]')).toContainText('BK-1');
  await expect(page.locator('[data-deposit-form]')).toHaveAttribute(
    'action',
    new RegExp(`/api/quote/${QUOTE_TOKEN}/deposit$`),
  );
  // 100 specimens at the $16 academic rate → $1,600, half of it up front.
  await expect(page.locator('[data-deposit-academic]')).toHaveText('$800.00');

  // The quote priced 100 specimens; 600 is a different project.
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-deposit-form]')).not.toHaveAttribute('action');
  await expect(page.locator('[data-quote-status]')).toHaveText(
    'Configuration changed — email a new quote to pay a deposit on it.',
  );
});
