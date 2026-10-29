// src/widget/state.ts
//
// A quote (and the checkout hand-off it can turn into) is only valid for
// the configuration it was priced from. The widget remembers the signature
// of the configuration a quote was created for, so that changing a count, a
// marker, or a service afterwards can retire the stale hand-off rather than
// let the hidden form post the old token at the old amount.
import type { ProjectConfig } from '@/lib/pricing/order';

/** A copy of `v` with every object's keys in sorted order (arrays keep
 * their order: marker and target order is part of the configuration). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(src)
        .sort()
        .map((k) => [k, sortKeys(src[k])]),
    );
  }
  return v;
}

/** A stable fingerprint of a configuration, independent of key order;
 * `''` when there is no configuration (no service chosen). */
export function configSignature(config: ProjectConfig | null): string {
  return config ? JSON.stringify(sortKeys(config)) : '';
}
