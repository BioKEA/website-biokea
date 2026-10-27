import { test, expect } from '@playwright/test';

const jsonLdGraph = async (page: import('@playwright/test').Page) => {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']));
};

test('pricing page renders hero and all four service sections', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Pricing for barcoding, eDNA, and metagenomic sequencing',
  );
  await expect(
    page.getByRole('heading', { name: 'Voucher-Linked Specimen Barcoding' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Environmental DNA (eDNA) Metabarcoding' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Metagenome and metatranscriptome sequencing' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Targeted eDNA for one or more species' }),
  ).toBeVisible();
});

test('in-page nav lists the four sections and each anchor exists', async ({ page }) => {
  await page.goto('/pricing');
  const nav = page.getByRole('navigation', { name: 'Pricing sections' });
  for (const id of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna']) {
    await expect(nav.locator(`a[href="#${id}"]`)).toHaveCount(1);
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
});

test('barcoding section shows all 4 tier prices, best rate on 5,000+, and the $5 id-only option', async ({
  page,
}) => {
  await page.goto('/pricing');
  const panel = page.locator('#barcoding');
  for (const price of ['$16', '$20', '$12', '$15', '$10', '$13', '$6', '$8']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '5,000+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: /Identification only, no voucher: \$5 per specimen/ }),
  ).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Confidence ratings' })).toBeVisible();
  await expect(panel.getByText('75% of your per-specimen rate')).toBeVisible();
  await expect(panel.getByRole('link', { name: /Configure and pay online/ })).toHaveAttribute(
    'href',
    'https://store.biokea.ai/products/specimen-barcoding',
  );
});

test('eDNA section shows all 3 tier prices, best rate on 200+, and the marker add-on', async ({
  page,
}) => {
  await page.goto('/pricing');
  const panel = page.locator('#metabarcoding');
  for (const price of ['$165', '$205', '$130', '$160', '$115', '$145']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '200+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
  await expect(panel.getByText(/\$12 per sample, per added marker/)).toBeVisible();
  await expect(panel.getByRole('link', { name: /Configure and pay online/ })).toHaveAttribute(
    'href',
    'https://store.biokea.ai/products/edna-metabarcoding',
  );
});

test('metagenomics section prices both assays and routes to a conversation', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#metagenomics');
  for (const price of ['$2,400', '$3,000', '$3,350', '$4,200']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  await expect(panel.getByText(/preserved for RNA/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(panel.getByRole('link', { name: /build a quote/i })).toHaveCount(0);
});

test('targeted eDNA section has no prices and a custom-quote button', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#targeted-edna');
  expect(await panel.innerText()).not.toContain('$');
  await expect(panel.getByRole('link', { name: 'Request a custom quote' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('comparison table has four service columns, a caption, and links to each section', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('heading', { name: 'Which service fits your project?' }),
  ).toBeVisible();
  const table = page.locator('#compare table');
  await expect(table.locator('caption')).toHaveCount(1);
  for (const [name, id] of [
    ['Specimen DNA barcoding', 'barcoding'],
    ['eDNA metabarcoding', 'metabarcoding'],
    ['Metagenome and metatranscriptome', 'metagenomics'],
    ['Targeted eDNA (qPCR)', 'targeted-edna'],
  ]) {
    const th = page.getByRole('columnheader', { name });
    await expect(th).toBeVisible();
    await expect(th.getByRole('link')).toHaveAttribute('href', `#${id}`);
  }
  await expect(page.getByRole('rowheader', { name: 'Pricing' })).toBeVisible();
});

test('comparison table scrolls inside the page on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/pricing');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = page.locator('#compare [data-table-scroll]');
  const canScroll = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(canScroll).toBe(true);
});

test('pricing hero CTAs: store, quote, contact, and the services catalog link', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('link', { name: /Configure and pay online/i }).first(),
  ).toHaveAttribute('href', 'https://store.biokea.ai/products/specimen-barcoding');
  await expect(page.getByRole('link', { name: 'or build a quote' }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Talk to us →' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(page.getByRole('link', { name: /See our full service catalog/ })).toHaveAttribute(
    'href',
    '/services',
  );
  await expect(page.getByRole('link', { name: /Build a quote/i }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});

test('pricing JSON-LD has four Service nodes with the right offer counts', async ({ page }) => {
  await page.goto('/pricing');
  const graph = await jsonLdGraph(page);
  expect(graph).toBeDefined();
  expect(graph['@graph']).toHaveLength(4);
  const byName = Object.fromEntries(graph['@graph'].map((n: { name: string }) => [n.name, n]));
  expect(byName['Voucher-Linked Specimen Barcoding'].offers).toHaveLength(5);
  expect(byName['Voucher-Linked Specimen Barcoding'].offers[0].priceSpecification).toHaveLength(2);
  expect(byName['Voucher-Linked Specimen Barcoding'].offers[4].priceSpecification[0].price).toBe(5);
  expect(byName['Environmental DNA (eDNA) Metabarcoding'].offers).toHaveLength(3);
  expect(byName['Metagenome and metatranscriptome sequencing'].offers).toHaveLength(2);
  expect(byName['Targeted eDNA for one or more species'].offers).toBeUndefined();
});

test('no internal cost-model comment leaks into the served HTML', async ({ page }) => {
  const response = await page.goto('/pricing');
  const body = (await response?.text()) ?? '';
  expect(body).not.toContain('Michelle');
  expect(body).not.toContain('gross margin');
  expect(body).not.toContain('cost model');
});
