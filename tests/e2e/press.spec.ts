import { test, expect } from '@playwright/test';

test('press page renders facts, founders, logos, and press contact', async ({ page }) => {
  const response = await page.goto('/press');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Press kit');
  await expect(page.getByText(/March 2025/).first()).toBeVisible();
  await expect(page.getByText(/Berkeley, California/).first()).toBeVisible();
  await expect(page.getByText('Sean Jungbluth').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'contact@biokea.ai' }).first()).toHaveAttribute(
    'href',
    'mailto:contact@biokea.ai',
  );
});

test('press page is reachable from footer', async ({ page }) => {
  await page.goto('/');
  const footerPress = page.locator('footer').getByRole('link', { name: 'Press' });
  await expect(footerPress).toHaveAttribute('href', '/press');
});
