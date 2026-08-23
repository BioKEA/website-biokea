import { test, expect } from '@playwright/test';

test('/terms states the payment, rate-lock, and credit policy', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /terms/i })).toBeVisible();
  await expect(page.getByText(/paid in full/i)).toBeVisible();
  await expect(page.getByText(/12 months/i)).toBeVisible();
  await expect(page.getByText(/credit/i).first()).toBeVisible();
});

test('no page still advertises a 50% deposit', async ({ page }) => {
  for (const path of ['/pricing', '/services', '/quote']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText(/50% deposit/i);
  }
});
