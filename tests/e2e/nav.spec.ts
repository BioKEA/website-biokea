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
  await expect(nav.getByRole('link', { name: 'Agentis', exact: true })).toHaveAttribute(
    'href',
    '/agentis',
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

test('footer renders logo, copyright, and external links', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByText(/© \d{4} BioKEA · Berkeley, CA/)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Agentis', exact: true })).toHaveAttribute(
    'href',
    '/agentis',
  );
  await expect(footer.getByRole('link', { name: /Hiring/i })).toHaveAttribute(
    'href',
    '/contact?topic=hiring',
  );
});
