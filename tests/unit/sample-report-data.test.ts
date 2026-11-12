import { test, expect } from 'vitest';
import { plates } from '@/data/sample-report';
import { existsSync, readFileSync, statSync } from 'node:fs';

const byId = (id: string) => plates.find((p) => p.id === id)!;
test('AA0022 has 95 wells: 35 species, 50 genus, 10 order-only, no H12', () => {
  const w = byId('aa0022').wells;
  expect(w).toHaveLength(95);
  expect(w.filter((x) => x.status === 'species')).toHaveLength(35);
  expect(w.filter((x) => x.status === 'genus')).toHaveLength(50);
  expect(w.filter((x) => x.status === 'order')).toHaveLength(10);
  expect(w.find((x) => x.well === 'H12')).toBeUndefined();
});
test('AA0055 shows only the 90 wells a pick was confirmed into, and defaults to C5', () => {
  expect(plates[0].id).toBe('aa0022');
  expect(byId('aa0055').wells.every((x) => x.status === 'awaiting')).toBe(true);
  expect(byId('aa0055').wells).toHaveLength(90);
  for (const id of ['D1', 'D4', 'G11', 'H7', 'H9'])
    expect(byId('aa0055').wells.find((x) => x.well === id)).toBeUndefined();
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
test('no species well shows a match to a different GenBank taxon', () => {
  const w = byId('aa0022').wells;
  for (const id of ['G2', 'H5', 'E1', 'H8'])
    expect(w.find((x) => x.well === id)).not.toHaveProperty('match');
  expect(w.find((x) => x.well === 'H2')?.match).toBe(100);
});
test('G2 and H5 are shown to genus only', () => {
  for (const id of ['G2', 'H5'])
    expect(byId('aa0022').wells.find((x) => x.well === id)).toMatchObject({
      status: 'genus',
      name: 'Catolaccus sp.',
    });
});
