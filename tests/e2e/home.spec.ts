import { test, expect } from '@playwright/test';

test('home renders hero, thesis, evidence, ecosystem, origin, CTA band', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Biology, decoded in the public interest.',
  );
  await expect(page.getByText(/bottleneck in modern biology/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Large Data Collider' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /What we're building/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Founded in March 2025/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Schedule a call/ }).first()).toHaveAttribute(
    'href',
    '/contact',
  );
});

test('ecosystem tile for Agentis links to agentis.science externally', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /agentis\.science/ }).first();
  await expect(link).toHaveAttribute('href', 'https://agentis.science');
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('home exposes Organization structured data', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).not.toBeNull();
  const parsed = JSON.parse(ld!);
  expect(parsed['@type']).toBe('Organization');
  expect(parsed.name).toBe('BioKEA');
});
