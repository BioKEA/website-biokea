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

test('mission/games no longer promotes the closed hunt', async ({ page }) => {
  await page.goto('/mission/games');
  // Scoped to the page's own content (#main), not the site-wide Nav —
  // the Nav's standalone "Golden Sample" link is cleaned up separately
  // when the nav is restructured.
  const main = page.locator('#main');
  const body = await main.innerText();
  expect(body).not.toContain('Golden Sample Hunt');
  expect(body).not.toContain('GOLDEN SAMPLE HIDDEN');
  await expect(main.getByRole('link', { name: /Golden Sample/i })).toHaveCount(0);
});

test('mission/games tile links go to /mission/games/<slug>/', async ({ page }) => {
  await page.goto('/mission/games');
  const codonTile = page.locator('[data-game-slug="codon2048"]');
  // Each tile has two links to the same playUrl (image + footer "Play" link);
  // assert the footer link by its exact accessible name.
  await expect(codonTile.getByRole('link', { name: 'Play Codon Collider ↗' })).toHaveAttribute(
    'href',
    '/mission/games/codon2048/',
  );
});

test('every Golden Sample route is gone', async ({ page }) => {
  for (const path of [
    '/mission/games/golden-sample-26',
    '/golden-sample-26',
    '/api/golden-sample/state',
    '/api/golden-sample/leaderboard',
    '/golden-sample/overlay.js',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should not exist`).toBe(404);
  }
});
