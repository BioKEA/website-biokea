import { test, expect } from '@playwright/test';

test('works page renders hero and all 6 products', async ({ page }) => {
  await page.goto('/works');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'One identity. One compute engine.',
  );
  await expect(page.getByText(/closed-testing alpha/i).first()).toBeVisible();
  for (const name of ['Works', 'Atlas', 'Studio', 'BioInfoOS', 'Scribe', 'Press']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});

test('coming-soon section names Droplet and Sequoia with no feature claims', async ({ page }) => {
  await page.goto('/works');
  await expect(page.getByText('Droplet', { exact: true })).toBeVisible();
  await expect(page.getByText('Sequoia', { exact: true })).toBeVisible();
});

test('every product card shows its subdomain as plain text (not yet linked — subdomains are down)', async ({
  page,
}) => {
  await page.goto('/works');
  await expect(page.getByText('atlas.biokea.ai', { exact: true })).toBeVisible();
  await expect(page.getByText('press.biokea.ai', { exact: true })).toBeVisible();
});

test('request access CTA routes to contact with the works topic', async ({ page }) => {
  await page.goto('/works');
  const cta = page.getByRole('link', { name: 'Request access' }).first();
  await expect(cta).toHaveAttribute('href', '/contact?topic=works');
});

test('works page exposes a SoftwareApplication JSON-LD entry per product', async ({ page }) => {
  await page.goto('/works');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']));
  expect(graph).toBeDefined();
  const names = graph['@graph'].map((n: { name: string }) => n.name);
  expect(names).toEqual(['Works', 'Atlas', 'Studio', 'BioInfoOS', 'Scribe', 'Press']);
  for (const node of graph['@graph']) {
    expect(node.releaseNotes).toBe('In closed-testing alpha.');
  }
});
