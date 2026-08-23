import { test, expect } from '@playwright/test';

test('lab page renders hero, photos, stats, hardware stages', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('5,000+ sq ft');
  await expect(page.locator('img[alt="Warehouse interior before buildout"]')).toBeVisible();
  await expect(page.locator('img[alt="Lab interior, operational"]')).toBeVisible();
  // After the Operational + Hardware merge, "Current state" is a
  // mono sub-eyebrow above the stats block, not a heading.
  await expect(page.getByText('Current state', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/extraction-to-sequencing pipeline/i)).toBeVisible();
  await expect(page.getByText(/KingFisher/).first()).toBeVisible();
  await expect(page.getByText(/Oxford Nanopore Promethion 2/).first()).toBeVisible();
  await expect(page.getByText(/diversityscanner/i).first()).toBeVisible();
});

test('lab page CTA routes to contact', async ({ page }) => {
  await page.goto('/lab');
  const cta = page.getByRole('link', { name: /Get in touch/ }).first();
  await expect(cta).toHaveAttribute('href', '/contact?topic=sequencing');
});

test('BugPicker is presented as operational, DiversityScanner as coming soon', async ({ page }) => {
  await page.goto('/lab');
  const bugpicker = page.locator('#lab-bugpicker');
  await expect(bugpicker).toBeVisible();
  await expect(bugpicker).toContainText(/operational/i);
  await expect(bugpicker).toContainText('2–6 mm');
  // DiversityScanner extends BELOW BugPicker's range and is not here yet.
  await expect(page.locator('#lab-diversityscanner')).toContainText(/coming soon/i);
  await expect(page.getByText(/arriving early summer/i)).toHaveCount(0);
});
