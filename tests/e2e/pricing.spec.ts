import { test, expect } from '@playwright/test';

test('pricing page renders hero and both service panels', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Pricing for specimen barcoding',
  );
  await expect(
    page.getByRole('heading', { name: 'Voucher-Linked Specimen Barcoding' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Environmental DNA (eDNA) Metabarcoding' }),
  ).toBeVisible();
});

test('barcoding panel shows all 4 tier prices, best rate on the 5,000+ tier', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#barcoding');
  for (const price of ['$16', '$20', '$12', '$15', '$10', '$13', '$6', '$8']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '5,000+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
});

test('eDNA panel shows all 3 tier prices, best rate on the 200+ tier', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#metabarcoding');
  for (const price of ['$165', '$205', '$130', '$160', '$115', '$145']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '200+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
});

test('comparison table renders both services', async ({ page }) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('heading', { name: 'Which service fits your project?' }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Specimen DNA Barcoding' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'eDNA Metabarcoding' })).toBeVisible();
});

test('pricing hero CTA configures a deposit in the store and offers a quote-only path', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('link', { name: /Configure & pay a 50% deposit online/i }),
  ).toHaveAttribute('href', 'https://store.biokea.ai/products/specimen-barcoding');
  await expect(page.getByRole('link', { name: 'or build a quote here' })).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Talk to us' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});

test('hero links back to /services for the rest of the catalog', async ({ page }) => {
  await page.goto('/pricing');
  const link = page.getByRole('link', { name: /See our full service catalog/ });
  await expect(link).toHaveAttribute('href', '/services');
});

test('pricing JSON-LD has one Service node per offering with tiered offers', async ({ page }) => {
  await page.goto('/pricing');
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
  expect(graph['@graph']).toHaveLength(2);
  const barcoding = graph['@graph'].find(
    (n: { name: string }) => n.name === 'Voucher-Linked Specimen Barcoding',
  );
  expect(barcoding.offers).toHaveLength(4);
  expect(barcoding.offers[0].priceSpecification).toHaveLength(2);
});

test('no internal cost-model comment leaks into the served HTML', async ({ page }) => {
  const response = await page.goto('/pricing');
  const body = (await response?.text()) ?? '';
  expect(body).not.toContain('Michelle');
  expect(body).not.toContain('gross margin');
  expect(body).not.toContain('cost model');
});

test('pricing page still links to the quote configurator', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('link', { name: /Build a quote/i }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
});
