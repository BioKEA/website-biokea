import { test, expect } from '@playwright/test';

test('golden-sample-26 promo hero renders headline, sub, and card image', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  await expect(page.getByText('ONE LAST THING · A HUNT')).toBeVisible();
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toContainText('There is a hidden world');
  await expect(h1).toContainText('all around you.');
  await expect(page.getByText('Even under your feet.')).toBeVisible();
  await expect(page.getByAltText(/Golden Sample Card/i)).toBeVisible();
});

test('golden-sample-26 lists 4 how-it-works steps', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  // Exact-match the eyebrow so it doesn't collide with the "How it works ↓"
  // CTA link in the hero.
  await expect(page.getByText('HOW IT WORKS', { exact: true })).toBeVisible();
  for (const step of [
    'Pick a handle',
    'Earn a sample',
    'Watch your collection fill',
    'Claim your prize',
  ]) {
    await expect(page.getByRole('heading', { name: step, exact: true })).toBeVisible();
  }
});

test('golden-sample-26 lists the prize bullets', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  await expect(page.getByText('THE PRIZE', { exact: true })).toBeVisible();
  await expect(page.getByText(/Real molecular sequencing of soil/i)).toBeVisible();
  await expect(page.getByText(/full report/i)).toBeVisible();
  await expect(page.getByText(/raw sequencing data/i)).toBeVisible();
  await expect(page.getByText(/Claude-powered explorer/i)).toBeVisible();
});

test('golden-sample-26 surfaces deadline + US-only + 18+ rules', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  // 60-day campaign window — see src/lib/golden-sample/config.ts.
  await expect(page.getByText('2026-07-07').first()).toBeVisible();
  await expect(page.getByText(/US residents only/i)).toBeVisible();
  await expect(page.getByText(/18\+/)).toBeVisible();
});

test('golden-sample-26 has a Submit section anchor and the redeem form region', async ({
  page,
}) => {
  await page.goto('/mission/games/golden-sample-26');
  await expect(page.locator('#submit')).toBeVisible();
  await expect(page.getByText('CLAIM YOUR PRIZE', { exact: true })).toBeVisible();
});

test('golden-sample-26 emits Event JSON-LD with launch + deadline dates', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  expect(parsed['@type']).toBe('Event');
  // 60-day public hunt window; launches 2026-05-07.
  expect(parsed.startDate).toBe('2026-05-07');
  expect(parsed.endDate).toBe('2026-07-07');
  expect(parsed.eventStatus).toBe('https://schema.org/EventScheduled');
});

test('golden-sample-26 renders all 6 collection slots', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  await expect(page.getByText('YOUR COLLECTION', { exact: true })).toBeVisible();
  for (let slot = 1; slot <= 6; slot++) {
    await expect(page.locator(`[data-slot="${slot}"]`)).toBeVisible();
  }
});

test('golden-sample-26 closes with the tagline', async ({ page }) => {
  await page.goto('/mission/games/golden-sample-26');
  await expect(page.getByText('Biodiversity can be discovered anywhere.')).toBeVisible();
});

test('legacy /golden-sample-26 redirects to /mission/games/golden-sample-26', async ({ page }) => {
  // 308 permanent redirect — preserves any in-the-wild links from
  // earlier shipped artefacts (in-game overlay's collection link,
  // social posts, the Golden Sample Card image's old caption, etc.).
  const response = await page.goto('/golden-sample-26');
  expect(page.url()).toMatch(/\/mission\/games\/golden-sample-26$/);
  expect(response?.status()).toBe(200);
});
