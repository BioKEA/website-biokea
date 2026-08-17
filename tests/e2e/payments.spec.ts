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
