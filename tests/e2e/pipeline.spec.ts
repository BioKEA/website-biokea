import { test, expect } from '@playwright/test';

test('pipeline page lists all six stages in order', async ({ page }) => {
  await page.goto('/pipeline');
  const numbers = await page.locator('ol li [data-step-number]').allInnerTexts();
  expect(numbers).toEqual(['01', '02', '03', '04', '05', '06']);
});

test('pipeline page teases BioInfoOS and Press with links into BioKEA Works', async ({ page }) => {
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'BioInfoOS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Press' })).toBeVisible();
  await expect(page.getByRole('link', { name: /See BioInfoOS in BioKEA Works/ })).toHaveAttribute(
    'href',
    '/works#bioinfoos',
  );
  await expect(page.getByRole('link', { name: /See Press in BioKEA Works/ })).toHaveAttribute(
    'href',
    '/works#press',
  );
});
