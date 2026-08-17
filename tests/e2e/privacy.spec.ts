import { test, expect } from '@playwright/test';

test('privacy policy still discloses retained hunt data, in past tense', async ({ page }) => {
  await page.goto('/privacy');
  const body = await page.locator('body').innerText();
  // The data is still held, so the disclosure must remain.
  expect(body).toContain('Golden Sample Hunt');
  // But it must not read as an ongoing programme.
  expect(body).not.toContain('the Golden Sample Hunt opens');
  expect(body).toContain('ran from May to July 2026');
});

test('privacy policy no longer links to the deleted hunt page', async ({ page }) => {
  await page.goto('/privacy');
  // Scoped to the policy body: the nav's hunt link is removed separately.
  await expect(page.locator('main a[href="/mission/games/golden-sample-26"]')).toHaveCount(0);
});
