import { test, expect } from 'vitest';
import { plates } from '@/data/sample-report';
import { existsSync, readFileSync, statSync } from 'node:fs';

const byId = (id: string) => plates.find((p) => p.id === id)!;
test('AA0022 has 95 wells: 37 species, 48 genus, 10 order-only, no H12', () => {
  const w = byId('aa0022').wells;
  expect(w).toHaveLength(95);
  expect(w.filter((x) => x.status === 'species')).toHaveLength(37);
  expect(w.filter((x) => x.status === 'genus')).toHaveLength(48);
  expect(w.filter((x) => x.status === 'order')).toHaveLength(10);
  expect(w.find((x) => x.well === 'H12')).toBeUndefined();
});
test('AA0055 has 95 awaiting wells and opens first on C5', () => {
  expect(plates[0].id).toBe('aa0055');
  expect(byId('aa0055').wells.every((x) => x.status === 'awaiting')).toBe(true);
  expect(byId('aa0055').wells).toHaveLength(95);
  expect(byId('aa0055').defaultWell).toBe('C5');
});
test('committed plate data carries no flagged detail', () => {
  for (const f of ['aa0022', 'aa0055']) {
    const s = readFileSync(`src/data/sample-report/${f}.json`, 'utf8');
    expect(s).not.toMatch(
      /wolbachia|rickettsi|candidate|contamin|swap|second organism|\bcontrol\b|xiphinema|nematode|CIBI\d|DNA-AA/i,
    );
  }
});
test('every well has a thumb and a large image, each under 200 KB', () => {
  for (const p of plates)
    for (const w of p.wells)
      for (const k of ['t', 'l']) {
        const f = `public/assets/sample-report/${p.id}/${k}-${w.well}.webp`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBeLessThan(200_000);
      }
  expect(existsSync('public/assets/sample-report/banner.webp')).toBe(true);
});
