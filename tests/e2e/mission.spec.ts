import { test, expect } from '@playwright/test';

test('mission page includes BioKEA expansion, team, partners, milestones', async ({ page }) => {
  await page.goto('/mission');
  await expect(page.getByText(/Biology Knowledge Exploration Assistant/).first()).toBeVisible();
  await expect(page.getByText('Sean Jungbluth')).toBeVisible();
  await expect(page.getByText('Michelle Jungbluth')).toBeVisible();
  await expect(page.getByText('Austin Baker')).toBeVisible();
  await expect(page.getByText(/California Institute of Biodiversity/).first()).toBeVisible();
  await expect(page.getByText(/San Francisco Estuary Institute/).first()).toBeVisible();
  await expect(page.getByText(/Coastal Quest/).first()).toBeVisible();
  await expect(page.locator('[data-milestone-date]').first()).toHaveText('2025-03');
});

test('mission page CTA routes to contact', async ({ page }) => {
  await page.goto('/mission');
  await expect(page.getByRole('link', { name: /Get in touch/ })).toHaveAttribute(
    'href',
    '/contact',
  );
});

test('mission Person JSON-LD records Sean Anthropic Ambassador award', async ({ page }) => {
  await page.goto('/mission');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const sean = parsed['@graph']?.find(
    (node: { '@id'?: string }) => node['@id'] === 'https://biokea.ai/mission#sean',
  );
  expect(sean).toBeDefined();
  expect(sean.award).toContain('Anthropic Claude Community Ambassador');
  expect(sean.affiliation?.name).toBe('Anthropic');
  expect(sean.affiliation?.url).toBe('https://www.anthropic.com/');
});

test('mission page renders expanded Programs & support section', async ({ page }) => {
  await page.goto('/mission');
  const main = page.locator('main, body');
  await expect(main.getByText('Programs & support').first()).toBeVisible();
  await expect(
    main.getByText(/supported by leading cloud and AI infrastructure programs/i),
  ).toBeVisible();
  await expect(main.getByRole('link', { name: 'AWS for Startups' }).first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'Google Cloud for Startups' }).first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'NVIDIA Inception' }).first()).toBeVisible();
});

test('Sean portrait shows the Anthropic Ambassador credential line', async ({ page }) => {
  await page.goto('/mission');
  const seanPortrait = page.locator('article', { hasText: 'Sean Jungbluth' }).first();
  await expect(seanPortrait.getByText('Anthropic Claude Community Ambassador')).toBeVisible();
});

test('Other team portraits do not render a credential line', async ({ page }) => {
  await page.goto('/mission');
  const austinPortrait = page.locator('article', { hasText: 'Austin Baker' }).first();
  await expect(austinPortrait.getByText('Anthropic Claude Community Ambassador')).toHaveCount(0);
});

test('mission page shows the new Anthropic milestones', async ({ page }) => {
  await page.goto('/mission');
  await expect(page.getByText(/Built with Claude Sonnet 4\.5 Challenge/i).first()).toBeVisible();
  await expect(page.getByText(/Anthropic Claude Community Ambassador/i).first()).toBeVisible();
  await expect(page.locator('[data-milestone-date][datetime="2025-10"]')).toBeVisible();
  await expect(page.locator('[data-milestone-date][datetime="2026-02"]')).toBeVisible();
});

test('Sean portrait shows the Ambassador line but hides the Challenge line', async ({ page }) => {
  await page.goto('/mission');
  const seanPortrait = page.locator('article', { hasText: 'Sean Jungbluth' }).first();
  await expect(seanPortrait.getByText('Anthropic Claude Community Ambassador')).toBeVisible();
  await expect(
    seanPortrait.getByText('Built with Claude Sonnet 4.5 Challenge — Winner'),
  ).toHaveCount(0);
});

test('mission Person JSON-LD reflects both Sean credentials', async ({ page }) => {
  await page.goto('/mission');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const sean = parsed['@graph']?.find(
    (node: { '@id'?: string }) => node['@id'] === 'https://biokea.ai/mission#sean',
  );
  expect(sean).toBeDefined();
  expect(Array.isArray(sean.award)).toBe(true);
  expect(sean.award).toContain('Anthropic Claude Community Ambassador');
  expect(sean.award).toContain('Built with Claude Sonnet 4.5 Challenge — Winner');
  expect(sean.affiliation?.name).toBe('Anthropic');
  expect(Array.isArray(sean.sameAs)).toBe(true);
  expect(sean.sameAs).toContain('https://x.com/alexalbert__/status/1978220407716245581');
});

test('mission page shows team and advisor bios', async ({ page }) => {
  await page.goto('/mission');
  await expect(page.getByText(/Microbial genomicist/i)).toBeVisible();
  await expect(page.getByText(/Author of Colloquip/i)).toBeVisible();
});
