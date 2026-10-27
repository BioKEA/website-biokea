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
  // The hero leads with the commercial CTA now that checkout is live;
  // the partnership "Schedule a call" survives in the closing CtaBand.
  await expect(page.getByRole('link', { name: /instant.*quote/i }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: /See what we're building/ }).first()).toHaveAttribute(
    'href',
    '/lab',
  );
  await expect(page.getByRole('link', { name: /Schedule a call/ }).first()).toHaveAttribute(
    'href',
    '/contact',
  );
});

test('ecosystem tile for BioKEA Works links to the /works page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /See BioKEA Works/ }).first();
  await expect(link).toHaveAttribute('href', '/works');
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

test('home FAQPage JSON-LD includes all 6 expected questions', async ({ page }) => {
  await page.goto('/');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && j['@type'] === 'FAQPage');
  expect(faq).toBeDefined();
  const questions = faq.mainEntity.map((q: { name: string }) => q.name);
  expect(questions).toContain('What is BioKEA?');
  expect(questions).toContain('What services does BioKEA offer?');
  expect(questions).toContain("Where is BioKEA's lab?");
  expect(questions).toContain('How do I engage BioKEA for a sequencing project?');
  expect(questions).toContain('What is BioKEA Works?');
  expect(questions).toContain('Who supports BioKEA?');
});

test('home <head> advertises llms-full.txt as alternate', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('link[rel="alternate"][type="text/markdown"]');
  await expect(link).toHaveAttribute('href', '/llms-full.txt');
});

test('home shows a four-card services strip with honest price ranges', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Four services. One Berkeley lab.' }),
  ).toBeVisible();
  const cards = page.locator('[data-services-strip] article');
  await expect(cards).toHaveCount(4);

  const barcoding = cards.filter({ hasText: 'Specimen barcoding' });
  await expect(barcoding).toContainText('$6–$20 per specimen');
  await expect(barcoding.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#barcoding',
  );

  const edna = cards.filter({ hasText: 'eDNA metabarcoding' });
  await expect(edna).toContainText('$115–$205 per sample');
  await expect(edna.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metabarcoding',
  );

  const meta = cards.filter({ hasText: 'Metagenomics' });
  await expect(meta).toContainText('$2,400–$4,200 per specimen');
  await expect(meta.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metagenomics',
  );

  const qpcr = cards.filter({ hasText: 'Targeted eDNA (qPCR)' });
  await expect(qpcr).toContainText('Custom quote');
  await expect(qpcr.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );

  // The strip never leads with the lowest rate as if everyone got it.
  const stripText = await page.locator('[data-services-strip]').innerText();
  expect(stripText).not.toMatch(/from \$/i);
  await expect(
    page
      .locator('[data-services-strip]')
      .getByRole('link', { name: /Build a quote in about a minute/ }),
  ).toHaveAttribute('href', '/quote');
});

test('home FAQ names all four priced services', async ({ page }) => {
  await page.goto('/');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && j['@type'] === 'FAQPage');
  const answer = faq.mainEntity.find(
    (q: { name: string }) => q.name === 'What services does BioKEA offer?',
  ).acceptedAnswer.text as string;
  for (const needle of ['barcoding', 'eDNA metabarcoding', 'metatranscriptome', 'qPCR']) {
    expect(answer).toContain(needle);
  }
});
