import { test, expect } from '@playwright/test';

const findGraph = async (
  page: import('@playwright/test').Page,
  pick: (j: Record<string, unknown>) => boolean,
) => {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && pick(j));
};

test('services page renders hero and lede', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Sequencing services for biodiversity research',
  );
  await expect(
    page.getByText(/DNA barcoding, environmental DNA, and long-read genomics/i).first(),
  ).toBeVisible();
});

test('catalog lede counts rate cards honestly: three priced, qPCR quoted per project', async ({
  page,
}) => {
  await page.goto('/services');
  await expect(page.getByText(/Three sequencing services with published rate cards/)).toBeVisible();
  await expect(page.getByText(/Four sequencing services with published rate cards/)).toHaveCount(0);
});

test('services page has no dollar-sign prices anywhere', async ({ page }) => {
  await page.goto('/services');
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toContain('$');
});

test('priced rows link to their pricing anchors and the right next step', async ({ page }) => {
  await page.goto('/services');
  const priced = page.locator('[data-offerings="priced"] li');
  await expect(priced).toHaveCount(4);

  const barcoding = priced.filter({ hasText: 'Voucher-linked specimen barcoding' });
  await expect(barcoding.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#barcoding',
  );
  await expect(barcoding.getByRole('link', { name: 'Configure →' })).toHaveAttribute(
    'href',
    '/quote',
  );

  const edna = priced.filter({ hasText: 'Environmental DNA (eDNA) metabarcoding' });
  await expect(edna.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metabarcoding',
  );
  await expect(edna.getByRole('link', { name: 'Configure →' })).toHaveAttribute('href', '/quote');

  const meta = priced.filter({ hasText: 'Metagenome and metatranscriptome sequencing' });
  await expect(meta.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metagenomics',
  );
  await expect(meta.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );

  const qpcr = priced.filter({ hasText: 'Targeted eDNA (qPCR)' });
  await expect(qpcr.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#targeted-edna',
  );
  await expect(qpcr.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('project-rate rows are listed with a human path', async ({ page }) => {
  await page.goto('/services');
  const rows = page.locator('[data-offerings="project-rate"] li');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'Study design' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Field collection assistance' })).toHaveCount(1);
  for (const row of await rows.all()) {
    await expect(row.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
      'href',
      '/contact?topic=sequencing',
    );
  }
});

test('the store checkout buttons no longer live on /services', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: /pay online/i })).toHaveCount(0);
  await expect(page.locator('a[href^="https://store.biokea.ai/products/"]')).toHaveCount(0);
});

test('services Service JSON-LD has eight nodes and no priceSpecification', async ({ page }) => {
  await page.goto('/services');
  const graph = await findGraph(
    page,
    (j) =>
      Array.isArray(j['@graph']) &&
      (j['@graph'] as { '@type': string }[])[0]?.['@type'] === 'Service',
  );
  expect(graph).toBeDefined();
  expect(graph['@graph']).toHaveLength(8);
  for (const node of graph['@graph']) expect(node.offers).toBeUndefined();
});

test('services primary CTA leads to the configurator and a human path survives', async ({
  page,
}) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: 'Build a quote' }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Talk to us →' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('services FAQPage JSON-LD includes turnaround, minimum-volume, and the which-service question', async ({
  page,
}) => {
  await page.goto('/services');
  const faq = await findGraph(
    page,
    (j) => j['@type'] === 'FAQPage' && String(j['@id']).includes('services#faq'),
  );
  expect(faq).toBeDefined();
  const questions = faq.mainEntity.map((q: { name: string }) => q.name);
  expect(questions.some((q: string) => /turnaround/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /minimum sample volume/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /difference between barcoding/i.test(q))).toBe(true);
  await expect(page.getByRole('link', { name: /compare them side by side/i })).toHaveAttribute(
    'href',
    '/pricing#compare',
  );
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

test('barcoding row names BugPicker and links to its lab section', async ({ page }) => {
  await page.goto('/services');
  const link = page.getByRole('link', { name: /see it running/i });
  await expect(link).toHaveAttribute('href', '/lab#lab-bugpicker');
  await expect(page.getByText(/BugPicker/).first()).toBeVisible();
});
