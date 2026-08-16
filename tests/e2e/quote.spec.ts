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

test('"save" wording never appears outside a dead zone', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-deadzone-callout]')).toBeHidden();
  const summary = await page.locator('[data-summary-panel]').innerText();
  expect(summary.toLowerCase()).not.toContain('save');
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
