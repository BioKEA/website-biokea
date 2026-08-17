import { test, expect } from '@playwright/test';

// The dev server has no CF_ACCESS_DEV_EMAIL in CI, so the admin gate must
// refuse. Locally with .dev.vars this test is skipped by the env check.
test('/admin is forbidden without a Cloudflare Access JWT', async ({ request }) => {
  test.skip(!!process.env.CF_ACCESS_DEV_EMAIL, 'dev bypass active locally');
  expect((await request.get('/admin')).status()).toBe(403);
  expect((await request.get('/admin/quotes/BK-2026-0001')).status()).toBe(403);
  expect(
    (
      await request.post('/api/admin/quotes/BK-2026-0001/balance', { form: { confirm: 'true' } })
    ).status(),
  ).toBe(403);
});

test('a forged Access header is refused', async ({ request }) => {
  const res = await request.get('/admin', { headers: { 'cf-access-jwt-assertion': 'not.a.jwt' } });
  expect(res.status()).toBe(403);
});

// With the dev bypass (CF_ACCESS_DEV_EMAIL in .dev.vars) the pages render.
// Without Supabase configured, /admin says so and a quote page 404s.
test('admin pages render for a dev-bypassed staff user', async ({ page }) => {
  test.skip(!process.env.CF_ACCESS_DEV_EMAIL, 'needs the dev bypass');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /quotes & payments/i })).toBeVisible();
  await expect(page.getByText(`Signed in as ${process.env.CF_ACCESS_DEV_EMAIL}`)).toBeVisible();
});

test('the deposit endpoint fails closed on an unknown quote / unconfigured deployment', async ({
  request,
}) => {
  const res = await request.post('/api/quote/11111111-1111-1111-1111-111111111111/deposit', {
    headers: { origin: 'http://localhost:4321' },
    form: { audience: 'commercial' },
    maxRedirects: 0,
  });
  // 500 "not configured" (CI), or 404 when Supabase is configured locally but the token is unknown.
  expect([404, 500]).toContain(res.status());
});

test('the webhook refuses an unsigned post', async ({ request }) => {
  const res = await request.post('/api/shopify/webhook', { data: { id: 'evt_x' } });
  // 404 until the Shopify webhook lands (Task 5), which tightens this to [401,500].
  expect([401, 404, 500]).toContain(res.status());
});

test('pricing and services advertise the online deposit', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText(/50% deposit online/i).first()).toBeVisible();
  await page.goto('/services');
  await expect(page.getByText(/50% deposit online/i).first()).toBeVisible();
});
