import { describe, it, expect } from 'vitest';
import { numericId } from '@/lib/payments/shopify-ids';

describe('numericId', () => {
  it('extracts the trailing numeric id from a Shopify DraftOrder GID', () => {
    expect(numericId('gid://shopify/DraftOrder/11')).toBe('11');
  });

  it('extracts the trailing numeric id from a Shopify Order GID', () => {
    expect(numericId('gid://shopify/Order/6042198999')).toBe('6042198999');
  });

  it('throws on a string with no trailing numeric id', () => {
    expect(() => numericId('gid://shopify/DraftOrder/')).toThrow('not a Shopify GID');
    expect(() => numericId('not-a-gid')).toThrow('not a Shopify GID');
  });
});
