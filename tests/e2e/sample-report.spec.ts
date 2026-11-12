import { test, expect } from '@playwright/test';

test('banner, tabs and CTA render', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.getByText('WHAT YOU GET BACK · INSECT DNA BARCODING')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Every insect. Photographed. Named.',
  );
  await expect(
    page.getByRole('tab', { name: 'Plate AA0055 · new high-res microscope' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: /Build a quote/ }).last()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByText('30+')).toBeVisible();
});
test('AA0055 opens on C5 with size and queue status', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.locator('[data-card-status]')).toHaveText(
    'WELL C5 · HIGH-RES IMAGE · BARCODE IN THE QUEUE',
  );
  await expect(page.locator('[data-card-meta]')).toHaveText(/^\d+\.\d × \d+\.\d mm as picked$/);
});
test('switching to AA0022 shows the sweat bee in H2, and clicking a well updates the card', async ({
  page,
}) => {
  await page.goto('/sample-report');
  await page.getByRole('tab', { name: 'Plate AA0022 · photographed + barcoded' }).click();
  await expect(page.locator('[data-card-label]')).toHaveText('A sweat bee');
  await expect(page.locator('[data-card-name]')).toHaveText('Lasioglossum hyalinum');
  await expect(page.locator('[data-card-meta]')).toHaveText('24,965 reads · 100.0% match');
  await page.locator('[data-plate="aa0022"] [data-well="E11"]').click();
  await expect(page.locator('[data-card-label]')).toHaveText('Minute pirate bug');
  await expect(page.locator('[data-card-img]')).toHaveAttribute(
    'src',
    '/assets/sample-report/aa0022/l-E11.webp',
  );
});
test('wells are keyboard-operable', async ({ page }) => {
  await page.goto('/sample-report');
  await page.locator('[data-plate="aa0055"] [data-well="A1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-card-status]')).toContainText('WELL A1');
});
test('no large well image loads before a click', async ({ page }) => {
  const larges: string[] = [];
  page.on('request', (r) => {
    if (/\/l-[A-H]\d+\.webp$/.test(r.url())) larges.push(r.url());
  });
  await page.goto('/sample-report');
  await page.waitForLoadState('networkidle');
  // Distinct URLs: the dev toolbar re-fetches page images, which would double-count.
  expect(new Set(larges).size).toBeLessThanOrEqual(1); // only the default card image
});
test('fits a 375px phone without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/sample-report');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
test('page has no flagged wording', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.locator('body')).not.toContainText(
    /Wolbachia|candidate new species|contaminat|swap/i,
  );
});

for (const path of ['/pricing', '/']) {
  test(`${path} links the sample report`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('a[href="/sample-report"]').first()).toBeAttached();
  });
}
