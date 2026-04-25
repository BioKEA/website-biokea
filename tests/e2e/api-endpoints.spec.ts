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
