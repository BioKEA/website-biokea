import { test, expect } from 'vitest';
import {
  toBarcodedWell,
  latestSizes,
  toHiresWell,
} from '../../scripts/sample-report/transform.mjs';

const row = (o: Record<string, unknown>) => ({
  well: 'A1',
  cat: 'species',
  order_recorded: 'Hymenoptera',
  bold_order: 'Hymenoptera',
  family: 'Halictidae',
  genus: 'Lasioglossum',
  species: 'Lasioglossum hyalinum',
  reads: 24965,
  gb_pid: '100.0',
  ...o,
});

test('species well gets common name, latin name, reads and match', () => {
  expect(toBarcodedWell(row({}))).toEqual({
    well: 'A1',
    status: 'species',
    label: 'A sweat bee',
    name: 'Lasioglossum hyalinum',
    reads: 24965,
    match: 100,
  });
});
test('species without a common name falls back to family', () => {
  expect(toBarcodedWell(row({ species: 'Nysius tenellus', family: 'Lygaeidae' })).label).toBe(
    'Lygaeidae',
  );
});
test('genus well shows family and "Genus sp." with no match', () => {
  const w = toBarcodedWell(
    row({ cat: 'genus', species: '', genus: 'Nysius', family: 'Lygaeidae', reads: 100 }),
  );
  expect(w).toEqual({
    well: 'A1',
    status: 'genus',
    label: 'Lygaeidae',
    name: 'Nysius sp.',
    reads: 100,
  });
});
test.each(['cand_hi', 'cand_lo', 'coarse', 'nontarget'])(
  '%s well shows only the recorded order',
  (cat) => {
    const w = toBarcodedWell(
      row({
        cat,
        order_recorded: 'Hemiptera',
        species: 'Wolbachia endosymbiont',
        family: 'Anaplasmataceae',
      }),
    );
    expect(w).toEqual({ well: 'A1', status: 'order', label: 'Hemiptera' });
    expect(JSON.stringify(w)).not.toMatch(/Wolbachia|Anaplasmataceae|candidate/i);
  },
);
test('control well is dropped', () => {
  expect(
    toBarcodedWell(row({ well: 'H12', cat: 'control', species: 'Reticulitermes hesperus' })),
  ).toBeNull();
});
test('sizes use the latest occupied attempt per well', () => {
  const s = latestSizes([
    {
      well: 'C5',
      logged_at: '2026-09-23T10:00:00Z',
      confirmation: 'well QA occupied',
      scan_bbox_width_mm: 1,
      scan_bbox_height_mm: 1,
    },
    {
      well: 'C5',
      logged_at: '2026-09-24T10:00:00Z',
      confirmation: 'well QA occupied',
      scan_bbox_width_mm: 7.04,
      scan_bbox_height_mm: 5.91,
    },
    {
      well: 'C5',
      logged_at: '2026-09-25T10:00:00Z',
      confirmation: 'well QA empty',
      scan_bbox_width_mm: 9,
      scan_bbox_height_mm: 9,
    },
  ]);
  expect(s.get('C5')).toBe('7.0 × 5.9 mm as picked');
});
test('hi-res well with no occupied attempt has no size', () => {
  const w = toHiresWell(
    'D1',
    latestSizes([
      {
        well: 'D1',
        logged_at: 'x',
        confirmation: 'bottom QA empty',
        scan_bbox_width_mm: 2,
        scan_bbox_height_mm: 2,
      },
    ]),
  );
  expect(w).toEqual({ well: 'D1', status: 'awaiting', label: 'Specimen D1' });
});
