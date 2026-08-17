import { test, expect } from '@playwright/test';

// Both the desktop nav and the mobile hamburger menu sit inside the
// same <nav>. Locators below scope to the desktop sub-list (a md:flex
// container) or the mobile menu (#mobile-menu) explicitly.

test('nav renders logo, three top-level links, About dropdown, and Build-a-quote CTA', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toBeVisible();

  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute(
    'href',
    '/services',
  );
  await expect(desktop.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
    'href',
    '/pricing',
  );
  await expect(desktop.getByRole('link', { name: 'Lab', exact: true })).toHaveAttribute(
    'href',
    '/lab',
  );
  await expect(desktop.getByText('About', { exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: /Build a quote/ })).toHaveAttribute(
    'href',
    '/quote',
  );
});

test('the old grouped labels and the Golden Sample link are gone', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('What we do', { exact: true })).toHaveCount(0);
  await expect(nav.getByText('Our work', { exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: /Golden Sample/i })).toHaveCount(0);
});

test('"About" dropdown reveals Mission, Projects, Works, Press, and Games', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toHaveAttribute(
    'href',
    '/mission',
  );
  await expect(desktop.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Works', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Press', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
    'href',
    '/mission/games',
  );
});

test('the About dropdown opens and closes on click', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeHidden();
});

test('clicking outside the nav closes any open dropdown', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();

  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();

  // Click somewhere on the page body, outside the nav.
  await page.locator('main').click({ position: { x: 50, y: 50 } });
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeHidden();
});

test('mobile nav toggle opens menu with links, About accordion, and CTA', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /open menu/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const mobile = page.locator('#mobile-menu');
  await expect(mobile.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
  await expect(mobile.getByText('About', { exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: /Build a quote/ })).toBeVisible();
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
  await expect(footer.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
    'href',
    '/pricing',
  );
  await expect(footer.getByRole('link', { name: 'Works', exact: true })).toHaveAttribute(
    'href',
    '/works',
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
