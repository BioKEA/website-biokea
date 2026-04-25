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
  expect(sean.award).toBe('Anthropic Claude Community Ambassador');
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
