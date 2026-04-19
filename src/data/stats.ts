// src/data/stats.ts
export interface Stat {
  value: string;
  label: string;
  live?: boolean;
  datetime?: string;
}

// Homepage: 3 pills. Inventory-first, with one dated live signal.
export const homepageStats: Stat[] = [
  { value: '5,000+', label: 'sq ft · Berkeley' },
  { value: '~80', label: 'instruments on site' },
  { value: 'Nov 2025', label: 'sequencer live', live: true, datetime: '2025-11' },
];

// Lab page: 4 pills, inventory-scale story.
export const labStats: Stat[] = [
  { value: '5,000+', label: 'sq ft · Berkeley' },
  { value: '~80', label: 'instruments on site' },
  { value: '4×', label: 'KingFisher fleet' },
  { value: '2×', label: 'Roche qPCR (LightCycler 480 II)' },
];

// Spec-potential capabilities — phrased as what the hardware is capable of,
// not claims about current throughput.
export const capabilityLines: string[] = [
  'Long-read nanopore sequencing across 2 flow cells on the ONT Promethion 2.',
  'Automated magnetic-bead extraction across four 96-well KingFisher platforms running in parallel.',
  'Real-time quantification on 384-well LightCycler 480 II blocks.',
];
