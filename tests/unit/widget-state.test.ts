import { describe, it, expect } from 'vitest';
import { configSignature } from '@/widget/state';

describe('configSignature', () => {
  const base = [{ serviceSlug: 'barcoding', count: 100 }];

  it('is stable for the same configuration', () => {
    expect(configSignature(base)).toBe(configSignature([{ serviceSlug: 'barcoding', count: 100 }]));
  });

  it('treats an omitted marker count as one marker', () => {
    expect(configSignature(base)).toBe(
      configSignature([{ serviceSlug: 'barcoding', count: 100, markers: 1 }]),
    );
  });

  it('changes when the count, the markers, or the services change', () => {
    expect(configSignature([{ serviceSlug: 'barcoding', count: 101 }])).not.toBe(
      configSignature(base),
    );
    expect(configSignature([{ serviceSlug: 'metabarcoding', count: 100, markers: 2 }])).not.toBe(
      configSignature([{ serviceSlug: 'metabarcoding', count: 100 }]),
    );
    expect(configSignature([...base, { serviceSlug: 'metabarcoding', count: 10 }])).not.toBe(
      configSignature(base),
    );
    expect(configSignature([])).not.toBe(configSignature(base));
  });
});
