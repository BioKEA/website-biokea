import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from '@/lib/pricing/order';
import { configSignature } from '@/widget/state';

describe('configSignature', () => {
  it('configSignature is stable across key order and empty for no config', () => {
    expect(
      configSignature({ service: 'metagenomics', assays: ['mg'], source: 'specimens', count: 2 }),
    ).toBe(
      configSignature({
        count: 2,
        source: 'specimens',
        assays: ['mg'],
        service: 'metagenomics',
      } as ProjectConfig),
    );
    expect(configSignature(null)).toBe('');
  });

  it('sorts nested keys too, and changes when any value changes', () => {
    const a: ProjectConfig = {
      service: 'metabarcoding',
      targets: ['vertebrates', 'fungi'],
      subs: { vertebrates: ['Fish'], fungi: ['Decomposers'] },
      markers: ['12S'],
      sampleType: 'water',
      samples: 60,
      kits: false,
    };
    const b = { ...a, subs: { fungi: ['Decomposers'], vertebrates: ['Fish'] } };
    expect(configSignature(a)).toBe(configSignature(b));
    expect(configSignature({ ...a, samples: 61 })).not.toBe(configSignature(a));
    expect(configSignature({ ...a, markers: ['12S', 'COI'] })).not.toBe(configSignature(a));
  });
});
