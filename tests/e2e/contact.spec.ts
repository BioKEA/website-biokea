import { test, expect } from '@playwright/test';

test('contact form renders all required fields', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Topic')).toBeVisible();
  await expect(page.getByLabel('Message')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send/ })).toBeVisible();
});

test('form shows error when endpoint returns error', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Invalid input' }),
    }),
  );
  await page.goto('/contact');
  await page.getByLabel('Name').fill('Test');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Topic').selectOption('Funding');
  await page.getByLabel('Message').fill('hello');
  await page.getByRole('button', { name: /Send/ }).click();
  await expect(page.getByText('Invalid input')).toBeVisible();
});

test('contact form preselects BioKEA Works topic when ?topic=works', async ({ page }) => {
  await page.goto('/contact?topic=works');
  await expect(page.getByLabel('Topic')).toHaveValue('BioKEA Works — request access');
});
