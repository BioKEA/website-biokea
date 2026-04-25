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

test('ecosystem tile for Agentis links to the internal coming-soon page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /agentis\.science/ }).first();
  await expect(link).toHaveAttribute('href', '/agentis');
});

test('home exposes Organization structured data', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).not.toBeNull();
  const parsed = JSON.parse(ld!);
  const org = parsed['@graph']?.find(
    (node: { '@type': string; name?: string }) => node['@type'] === 'Organization',
  );
  expect(org).toBeDefined();
  expect(org.name).toBe('BioKEA');
  expect(org.makesOffer).toBeDefined();
});

test('home hero uses a semantic <h1> element', async ({ page }) => {
  await page.goto('/');
  const h1s = await page.locator('h1').count();
  expect(h1s).toBeGreaterThan(0);
  await expect(page.locator('h1').first()).toHaveText('Biology, decoded in the public interest.');
});

test('home Organization JSON-LD includes program memberships', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const org = parsed['@graph']?.find(
    (node: { '@type': string }) => node['@type'] === 'Organization',
  );
  expect(org).toBeDefined();
  expect(Array.isArray(org.memberOf)).toBe(true);
  const memberNames = org.memberOf.map((m: { name: string }) => m.name);
  expect(memberNames).toContain('AWS for Startups');
  expect(memberNames).toContain('Google Cloud for Startups');
  expect(memberNames).toContain('NVIDIA Inception');
});

test('footer renders Programs & support strip with all three programs', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByText('Programs & support')).toBeVisible();
  await expect(footer.getByRole('link', { name: 'AWS for Startups' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Google Cloud for Startups' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'NVIDIA Inception' })).toBeVisible();
});
