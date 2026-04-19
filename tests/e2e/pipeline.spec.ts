import { test, expect } from '@playwright/test';

test('pipeline page lists all six stages in order', async ({ page }) => {
  await page.goto('/pipeline');
  const numbers = await page.locator('ol li [data-step-number]').allInnerTexts();
  expect(numbers).toEqual(['01', '02', '03', '04', '05', '06']);
});

test('pipeline page teases BioinfoOS and Agentis with external link', async ({ page }) => {
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'BioinfoOS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agentis' })).toBeVisible();
  await expect(page.getByRole('link', { name: /agentis\.science/ }).last()).toHaveAttribute(
    'href',
    'https://agentis.science',
  );
});
