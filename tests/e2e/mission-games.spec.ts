import { test, expect } from '@playwright/test';

test('mission/games renders headline, lede, and 6 game tiles', async ({ page }) => {
  await page.goto('/mission/games');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biology, played.');
  // Six tiles, one per game in src/data/games.ts
  await expect(page.getByRole('heading', { name: 'Codon Collider', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pipette Rush', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plasmid Plinko', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Particle Accelerator', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Biodiversity Discovery Lab', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'WildCal', exact: true })).toBeVisible();
});

test('mission/games shows exactly 6 game tiles', async ({ page }) => {
  await page.goto('/mission/games');
  await expect(page.locator('[data-game-slug]')).toHaveCount(6);
});

test('mission/games footer CTA links to /golden-sample-26', async ({ page }) => {
  await page.goto('/mission/games');
  const cta = page.getByRole('link', { name: /Six cards are hidden/i });
  await expect(cta).toHaveAttribute('href', '/golden-sample-26');
});

test('mission/games tile links go to /mission/games/<slug>/', async ({ page }) => {
  await page.goto('/mission/games');
  const codonTile = page.locator('[data-game-slug="codon2048"]');
  await expect(codonTile.getByRole('link', { name: /Play/i })).toHaveAttribute(
    'href',
    '/mission/games/codon2048/',
  );
});
