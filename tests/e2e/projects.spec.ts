import { test, expect } from '@playwright/test';

test('projects page renders hero, counts, and the Intertidal live project', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("What we're shipping");
  await expect(
    page.getByRole('heading', { name: /Intertidal Biodiversity DNA Barcode Library/ }),
  ).toBeVisible();
  await expect(page.getByText('Coastal Quest').first()).toBeVisible();
});

test('live project card links out to the Shiny app in a new tab', async ({ page }) => {
  await page.goto('/projects');
  const appLink = page.getByRole('link', { name: /biokea\.shinyapps\.io/ }).first();
  await expect(appLink).toHaveAttribute(
    'href',
    'https://biokea.shinyapps.io/california_intertidal_gap_analysis/',
  );
  await expect(appLink).toHaveAttribute('target', '_blank');
  await expect(appLink).toHaveAttribute('rel', /noopener/);
});

test('revealing-soon and coming-soon badges render', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByText('REVEALING SOON').first()).toBeVisible();
  await expect(page.getByText('COMING SOON').first()).toBeVisible();
  await expect(page.getByText('LIVE').first()).toBeVisible();
});

test('Intertidal card shows Sean as sole lead', async ({ page }) => {
  await page.goto('/projects');
  const intertidal = page
    .locator('article')
    .filter({ hasText: /Intertidal Biodiversity DNA Barcode Library/ });
  await expect(intertidal.getByText('★ Sean')).toBeVisible();
});

test('DaKineDiving card renders with award badge and video links', async ({ page }) => {
  await page.goto('/projects');
  const card = page.locator('article').filter({ hasText: 'DaKineDiving' });
  await expect(card).toBeVisible();

  const awardLink = card.getByRole('link', { name: /Built with Claude Sonnet 4\.5 Challenge/ });
  await expect(awardLink).toBeVisible();
  await expect(awardLink).toHaveAttribute(
    'href',
    'https://x.com/alexalbert__/status/1978220407716245581',
  );
  await expect(awardLink).toHaveAttribute('target', '_blank');
  await expect(awardLink).toHaveAttribute('rel', /noopener/);

  const videoOne = card.getByRole('link', { name: 'Walkthrough', exact: true });
  await expect(videoOne).toBeVisible();
  await expect(videoOne).toHaveAttribute('target', '_blank');

  const videoTwo = card.getByRole('link', { name: 'Walkthrough · biology features' });
  await expect(videoTwo).toBeVisible();
});

test('DaKineDiving card does not show "Revealing soon" fallback in its footer', async ({
  page,
}) => {
  await page.goto('/projects');
  const card = page.locator('article').filter({ hasText: 'DaKineDiving' });
  await expect(card.getByText(/Revealing soon/i)).toHaveCount(0);
});
