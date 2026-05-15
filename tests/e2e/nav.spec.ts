import { test, expect } from '@playwright/test';

// Both the desktop nav and the mobile hamburger menu sit inside the
// same <nav>. Locators below scope to the desktop sub-list (a md:flex
// container) or the mobile menu (#mobile-menu) explicitly.

test('nav renders logo, three dropdown groups, Golden Sample, and Get-in-touch CTA', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toBeVisible();

  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await expect(desktop.getByText('What we do', { exact: true })).toBeVisible();
  await expect(desktop.getByText('Our work', { exact: true })).toBeVisible();
  await expect(desktop.getByText('Mission', { exact: true })).toBeVisible();
  // Golden Sample 26 is a gold-accented standalone link in the nav.
  await expect(desktop.getByRole('link', { name: 'Golden Sample', exact: true })).toHaveAttribute(
    'href',
    '/mission/games/golden-sample-26',
  );
  await expect(desktop.getByRole('link', { name: /Get in touch/ })).toHaveAttribute(
    'href',
    '/contact',
  );
});

test('"What we do" dropdown reveals Services and Lab', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('What we do', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
});

test('"Our work" dropdown reveals Projects, Agentis, and Press', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('Our work', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Agentis', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Press', exact: true })).toBeVisible();
});

test('only one dropdown stays open at a time', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();

  await desktop.getByText('What we do', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeVisible();

  await desktop.getByText('Our work', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  // First dropdown should have closed when the second one opened.
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeHidden();
});

test('clicking outside the nav closes any open dropdown', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();

  await desktop.getByText('What we do', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeVisible();

  // Click somewhere on the page body, outside the nav.
  await page.locator('main').click({ position: { x: 50, y: 50 } });
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeHidden();
});

test('Pipeline is not in the desktop nav (demoted to footer)', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('What we do', { exact: true }).click();
  await desktop.getByText('Our work', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Pipeline', exact: true })).toHaveCount(0);
});

test('mobile nav toggle opens menu with grouped accordion + CTA', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /open menu/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const mobile = page.locator('#mobile-menu');
  await expect(mobile.getByText('What we do', { exact: true })).toBeVisible();
  await expect(mobile.getByText('Our work', { exact: true })).toBeVisible();
  await expect(mobile.getByText('Mission', { exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Golden Sample', exact: true })).toHaveAttribute(
    'href',
    '/mission/games/golden-sample-26',
  );
  await expect(mobile.getByRole('link', { name: /Get in touch/ })).toBeVisible();
});

test('footer renders logo, copyright, demoted links, and Hiring callout', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByText(/© \d{4} BioKEA · Berkeley, CA/)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Pipeline', exact: true })).toHaveAttribute(
    'href',
    '/pipeline',
  );
  await expect(footer.getByRole('link', { name: 'Agentis', exact: true })).toHaveAttribute(
    'href',
    '/agentis',
  );
  await expect(footer.getByRole('link', { name: 'Press', exact: true })).toHaveAttribute(
    'href',
    '/press',
  );
  await expect(footer.getByRole('link', { name: /Hiring/i })).toHaveAttribute(
    'href',
    '/contact?topic=hiring',
  );
});
