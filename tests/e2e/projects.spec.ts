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
