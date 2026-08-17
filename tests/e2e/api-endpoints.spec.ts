import { test, expect } from '@playwright/test';

test('/api/team.json returns valid team payload', async ({ request }) => {
  const response = await request.get('/api/team.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const payload = await response.json();
  expect(payload).toHaveProperty('team');
  expect(Array.isArray(payload.team)).toBe(true);
  const names = payload.team.map((m: { name: string }) => m.name);
  expect(names).toContain('Sean Jungbluth');
  expect(names).toContain('Michelle Jungbluth');
  expect(names).toContain('Austin Baker');
});

test('/api/projects.json returns valid projects payload', async ({ request }) => {
  const response = await request.get('/api/projects.json');
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toHaveProperty('projects');
  expect(Array.isArray(payload.projects)).toBe(true);
  const slugs = payload.projects.map((p: { slug: string }) => p.slug);
  expect(slugs).toContain('california-intertidal-gap-analysis');
  expect(slugs).toContain('colloquip');
  expect(slugs).toContain('dakinediving');
});

test('/api/capabilities.json returns lab, services, equipment, and partners', async ({
  request,
}) => {
  const response = await request.get('/api/capabilities.json');
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.lab).toMatchObject({
    location: 'Berkeley, CA',
    sequencer: 'Oxford Nanopore Promethion 2',
  });
  expect(Array.isArray(payload.services)).toBe(true);
  const serviceNames = payload.services.map((s: { name: string }) => s.name);
  expect(serviceNames).toContain('eDNA and metabarcoding');
  expect(Array.isArray(payload.equipmentByStage)).toBe(true);
  expect(Array.isArray(payload.partners)).toBe(true);
  const partnerNames = payload.partners.map((p: { name: string }) => p.name);
  expect(partnerNames).toContain('California Institute for Biodiversity');
});

// The in-game "Lab updates" pill on games.biokea.ai posts form-encoded to
// /api/subscribe cross-origin. Astro's stock CSRF check would 403 that, so
// src/middleware.ts re-implements it with an allow-list. An invalid email
// keeps the endpoint from ever writing anything; anything but 403 means
// the request got past the origin gate (400 from validation in prod, 500
// "not configured" on a dev box without .dev.vars).
test('/api/subscribe accepts form posts from games.biokea.ai but not from other origins', async ({
  request,
}) => {
  const post = (origin: string) =>
    request.post('/api/subscribe', {
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      data: 'email=not-an-email&source=codon2048&consent=true',
    });
  expect((await post('https://games.biokea.ai')).status()).not.toBe(403);
  expect((await post('http://localhost:4321')).status()).not.toBe(403);
  expect((await post('https://evil.example')).status()).toBe(403);
});

// The store widget (store.biokea.ai) calls /api/quote cross-origin with a
// JSON body, which browsers preflight. src/lib/cors.ts answers the
// preflight and echoes the allow-origin header only for allow-listed
// origins; POST responses carry the same header so the browser doesn't
// block reading the body.
test('OPTIONS /api/quote answers the CORS preflight for the store origin only', async ({
  request,
}) => {
  const allowed = await request.fetch('/api/quote', {
    method: 'OPTIONS',
    headers: { origin: 'https://store.biokea.ai' },
  });
  expect(allowed.status()).toBe(204);
  expect(allowed.headers()['access-control-allow-origin']).toBe('https://store.biokea.ai');

  const denied = await request.fetch('/api/quote', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example' },
  });
  expect(denied.status()).toBe(204);
  expect(denied.headers()['access-control-allow-origin']).toBeUndefined();
});

// An invalid body 400s once /api/quote is configured; on a dev box without
// .dev.vars it 500s "not configured" instead (see the /api/subscribe test
// above for the same distinction). Either way the CORS header must be on
// the response, since src/pages/api/quote.ts wraps every exit with
// withCors().
test('POST /api/quote carries the CORS header from the store origin even on a validation error', async ({
  request,
}) => {
  const response = await request.post('/api/quote', {
    headers: { origin: 'https://store.biokea.ai', 'content-type': 'application/json' },
    data: { name: '' },
  });
  expect([400, 500]).toContain(response.status());
  expect(response.headers()['access-control-allow-origin']).toBe('https://store.biokea.ai');
});
