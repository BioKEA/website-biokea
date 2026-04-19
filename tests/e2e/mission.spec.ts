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
