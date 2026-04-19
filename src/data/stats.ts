// src/data/stats.ts
export interface Stat {
  value: string;
  label: string;
  live?: boolean;
}

// Homepage: 3 pills. First is confirmed; other two are placeholders
// until real operating figures are supplied.
export const homepageStats: Stat[] = [
  { value: '5,000', label: 'sq ft · Berkeley' },
  { value: '—', label: 'reads / run · tbd' }, // VERIFY: placeholder, awaiting real number
  { value: '—', label: 'novel lineages · tbd' }, // VERIFY: placeholder, awaiting real number
];

// Lab page: more detailed operational stats. Confirmed items only.
export const labStats: Stat[] = [
  { value: '5,000', label: 'sq ft · Berkeley' },
  { value: '1×', label: 'ONT Promethion 2' },
  { value: 'Nov 2025', label: 'sequencer live' },
  { value: '—', label: 'reads / run · tbd', live: false }, // VERIFY: placeholder
];
