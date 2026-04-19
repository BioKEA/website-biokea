import { test, expect } from '@playwright/test';

test('lab page renders hero, photos, stats, hardware sections', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('5,000 sq ft');
  await expect(page.locator('img[alt="Warehouse interior before buildout"]')).toBeVisible();
  await expect(page.locator('img[alt="Lab interior, operational"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On site today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pipeline coming online' })).toBeVisible();
  await expect(page.getByText(/ONT Promethion 2/).first()).toBeVisible();
  await expect(page.getByText(/DiversityScanner/).first()).toBeVisible();
});

test('lab page CTA routes to contact', async ({ page }) => {
  await page.goto('/lab');
  const cta = page.getByRole('link', { name: /Get in touch/ });
  await expect(cta).toHaveAttribute('href', '/contact');
});
