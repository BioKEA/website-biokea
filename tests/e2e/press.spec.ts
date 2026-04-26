import { test, expect } from '@playwright/test';

test('press page renders facts, founders, logos, and Anthropic coverage', async ({ page }) => {
  const response = await page.goto('/press');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Press kit');
  await expect(page.getByText(/March 2025/).first()).toBeVisible();
  await expect(page.getByText(/Berkeley, California/).first()).toBeVisible();
  await expect(page.getByText('Sean Jungbluth').first()).toBeVisible();
  const coverageLink = page.getByRole('link', {
    name: /Built with Claude Sonnet 4.5 Challenge/i,
  });
  await expect(coverageLink).toHaveAttribute(
    'href',
    'https://x.com/alexalbert__/status/1978220407716245581',
  );
  await expect(coverageLink).toHaveAttribute('target', '_blank');
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
