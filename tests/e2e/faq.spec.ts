import { test, expect } from '@playwright/test';

test('faq page renders hero and all four question groups', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Frequently asked questions');
  await expect(page.getByRole('heading', { level: 2, name: 'Samples & submission' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Sequencing & technology' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Data & results' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Pricing & logistics' })).toBeVisible();
});

test('faq page FAQPage JSON-LD includes turnaround and minimum-volume questions', async ({
  page,
}) => {
  await page.goto('/faq');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && j['@type'] === 'FAQPage' && j['@id']?.includes('faq#faq'));
  expect(faq).toBeDefined();
  const questions = faq.mainEntity.map((q: { name: string }) => q.name);
  expect(questions.length).toBe(12);
  expect(questions.some((q: string) => /turnaround/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /minimum sample volume/i.test(q))).toBe(true);
});

test('faq sequencing-technology answer names both platforms', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByText(/Oxford Nanopore PromethION 2 Solo/i)).toBeVisible();
  await expect(page.getByText(/Illumina MiSeq i100/i)).toBeVisible();
});

test('faq still offers a human path', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByRole('link', { name: 'Talk to us' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});
