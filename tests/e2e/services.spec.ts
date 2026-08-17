import { test, expect } from '@playwright/test';

test('services page renders hero, catalog, and FAQ', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Sequencing services for biodiversity research',
  );
  await expect(
    page.getByText(/DNA barcoding, environmental DNA, and long-read genomics/i).first(),
  ).toBeVisible();
});

test('services catalog lists barcoding and qPCR offerings without prices', async ({ page }) => {
  await page.goto('/services');
  await expect(
    page.getByText(/DNA-based identification of organisms \(barcoding\)/i),
  ).toBeVisible();
  await expect(page.getByText(/qPCR \/ eDNA assay/i).first()).toBeVisible();
  await expect(page.getByText(/Field collection assistance/i)).toBeVisible();
});

test('services page has no dollar-sign prices anywhere', async ({ page }) => {
  await page.goto('/services');
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toContain('$');
});

test('services Service JSON-LD nodes carry no priceSpecification', async ({ page }) => {
  await page.goto('/services');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']) && j['@graph'][0]?.['@type'] === 'Service');
  expect(graph).toBeDefined();
  for (const node of graph['@graph']) {
    expect(node.offers).toBeUndefined();
  }
});

test('services primary CTA now leads to the configurator', async ({ page }) => {
  await page.goto('/services');
  const primary = page.getByRole('link', { name: 'Build a quote' }).first();
  await expect(primary).toHaveAttribute('href', '/quote');
  // The old ambiguous label is gone everywhere on the page.
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});

test('services still offers a human path', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: 'Talk to us' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('services page has Service JSON-LD nodes', async ({ page }) => {
  await page.goto('/services');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const serviceGraph = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']) && j['@graph'][0]?.['@type'] === 'Service');
  expect(serviceGraph).toBeDefined();
  expect(serviceGraph['@graph'].length).toBeGreaterThanOrEqual(7);
});

test('services page FAQPage JSON-LD includes turnaround and minimum-volume questions', async ({
  page,
}) => {
  await page.goto('/services');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && j['@type'] === 'FAQPage' && j['@id']?.includes('services#faq'));
  expect(faq).toBeDefined();
  const questions = faq.mainEntity.map((q: { name: string }) => q.name);
  expect(questions.some((q: string) => /turnaround/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /minimum sample volume/i.test(q))).toBe(true);
});

test('contact form preselects Sequencing service inquiry topic when ?topic=sequencing', async ({
  page,
}) => {
  await page.goto('/contact?topic=sequencing');
  await expect(page.getByLabel('Topic')).toHaveValue('Sequencing service inquiry');
});

test('services FAQ links BioInfoOS to BioKEA Works', async ({ page }) => {
  await page.goto('/services');
  const link = page.getByRole('link', { name: 'BioKEA Works' }).last();
  await expect(link).toHaveAttribute('href', '/works#bioinfoos');
});

test('barcoding and eDNA catalog rows link out to their pricing anchors', async ({ page }) => {
  await page.goto('/services');
  const barcodingRow = page
    .locator('li')
    .filter({ hasText: 'DNA-based identification of organisms (barcoding)' });
  await expect(barcodingRow.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#barcoding',
  );
  const ednaRow = page
    .locator('li')
    .filter({ hasText: 'qPCR / eDNA assay (single + multi-species)' });
  await expect(ednaRow.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metabarcoding',
  );
});
