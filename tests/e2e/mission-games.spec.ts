import { test, expect } from '@playwright/test';

test('mission/games renders headline, lede, and 6 game tiles', async ({ page }) => {
  await page.goto('/mission/games');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biology, played.');
  // Six game tiles, one per project in src/data/projects.ts
  await expect(page.getByText('Intertidal Biodiversity DNA Barcode Library')).toBeVisible();
  await expect(page.getByText('California Insect Barcoding Initiative')).toBeVisible();
  await expect(page.getByText('DaKineDiving', { exact: false })).toBeVisible();
  await expect(page.getByText('Bay estuary metabarcoding baseline')).toBeVisible();
  await expect(page.getByText('Long-read microbial genome resource')).toBeVisible();
  await expect(page.getByText('Colloquip', { exact: false })).toBeVisible();
});

test('mission/games shows a GamePlaceholder slot per tile', async ({ page }) => {
  await page.goto('/mission/games');
  // Six placeholder slots, one per project
  const slots = page.locator('[data-game-id]');
  await expect(slots).toHaveCount(6);
});

test('mission/games footer CTA links to /golden-sample-26', async ({ page }) => {
  await page.goto('/mission/games');
  const cta = page.getByRole('link', { name: /Six cards are hidden/i });
  await expect(cta).toHaveAttribute('href', '/golden-sample-26');
});
