import { test, expect } from '@playwright/test';

test('lab page renders hero, photos, stats, hardware stages', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('5,000+ sq ft');
  await expect(page.locator('img[alt="Warehouse interior before buildout"]')).toBeVisible();
  await expect(page.locator('img[alt="Lab interior, operational"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current state' })).toBeVisible();
  await expect(page.getByText(/extraction-to-sequencing pipeline/i)).toBeVisible();
  await expect(page.getByText(/KingFisher/).first()).toBeVisible();
  await expect(page.getByText(/Oxford Nanopore Promethion 2/).first()).toBeVisible();
  await expect(page.getByText(/diversityscanner/i).first()).toBeVisible();
});

test('lab page CTA routes to contact', async ({ page }) => {
  await page.goto('/lab');
  const cta = page.getByRole('link', { name: /Get in touch/ }).first();
  await expect(cta).toHaveAttribute('href', '/contact');
});
