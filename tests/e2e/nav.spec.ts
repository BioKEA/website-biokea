import { test, expect } from '@playwright/test';

test('nav renders logo and all primary links', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Pipeline', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Contact', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: /agentis\.science/ })).toHaveAttribute(
    'href',
    'https://agentis.science',
  );
});

test('mobile nav toggle opens menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /open menu/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
});
