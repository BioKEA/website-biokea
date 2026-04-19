import { test, expect } from '@playwright/test';

test('agentis page renders coming-soon hero and 3 concept cards', async ({ page }) => {
  await page.goto('/agentis');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'AI-first scientific journal',
  );
  await expect(page.getByText(/coming soon/i).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /AI pre-screen \+ verified human review/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /StoryMaps, not dead PDFs/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Built on open protocols/ })).toBeVisible();
});

test('agentis CTA routes to contact with topic param', async ({ page }) => {
  await page.goto('/agentis');
  const cta = page.getByRole('link', { name: /Get early access updates/ });
  await expect(cta).toHaveAttribute('href', '/contact?topic=agentis');
});

test('contact form preselects Agentis topic when ?topic=agentis', async ({ page }) => {
  await page.goto('/contact?topic=agentis');
  await expect(page.getByLabel('Topic')).toHaveValue('Agentis — early access');
});
