// Shared ProjectConfig fixtures for the order and widget-template tests.
import type { BarcodingConfig, MetabarcodingConfig, TargetedEdnaConfig } from '@/lib/pricing/order';

/** 3 water samples × up to 50 invertebrates, COI, voucher-linked: 150 specimens. */
export const bc = (over: Partial<BarcodingConfig> = {}): BarcodingConfig => ({
  service: 'barcoding',
  handling: 'voucher',
  target: 'invertebrates',
  markers: ['COI'],
  sampleType: 'water',
  samples: 3,
  perSample: 50,
  preservativeEdna: false,
  kits: false,
  ...over,
});

/** 60 water samples, vertebrates, 12S + COI: $10,500 commercial. */
export const edna = (over: Partial<MetabarcodingConfig> = {}): MetabarcodingConfig => ({
  service: 'metabarcoding',
  targets: ['vertebrates'],
  markers: ['12S', 'COI'],
  sampleType: 'water',
  samples: 60,
  kits: false,
  ...over,
});

/** A targeted-eDNA (qPCR) intake: always a custom quote. */
export const qpcr = (over: Partial<TargetedEdnaConfig> = {}): TargetedEdnaConfig => ({
  service: 'targeted-edna',
  species: 'Dreissena',
  measure: 'presence',
  assayExists: 'unsure',
  sampleType: 'water',
  ...over,
});
