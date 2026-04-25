import { test, expect } from '@playwright/test';

test('llms.txt is served as markdown with agent-first sections', async ({ page }) => {
  const response = await page.goto('/llms.txt');
  expect(response?.status()).toBe(200);
  const body = (await response?.text()) ?? '';
  expect(body).toContain('BioKEA');
  expect(body).toContain('## What BioKEA operates');
  expect(body).toContain('## Services');
  expect(body).toContain('molecular sequencing');
  expect(body).toContain('eDNA');
  expect(body).toContain('## Team');
  expect(body).toContain('Sean Jungbluth');
  expect(body).toContain('## Partners');
  expect(body).toContain('California Institute for Biodiversity');
  expect(body).toContain('## Vocabulary');
  expect(body).toContain('LDC');
  expect(body).toContain('Built with Claude Sonnet 4.5 Challenge winner');
  expect(body).toContain('https://x.com/alexalbert__/status/1978220407716245581');
  expect(body).toContain('## Programs & support');
  expect(body).toContain('AWS for Startups');
  expect(body).toContain('Google Cloud for Startups');
  expect(body).toContain('NVIDIA Inception');
  expect(body).toContain('Anthropic Claude Community Ambassador');
});
