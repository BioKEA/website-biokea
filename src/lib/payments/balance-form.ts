// src/lib/payments/balance-form.ts
//
// Parses the balance form (POST body on submit, query string on the admin
// page's preview round-trip). Split out of the API route module: the route
// imports the payments gateway, and dragging that into the admin page's
// module graph broke Vite's dev SSR resolution.
import type { QuoteLineInput } from '@/lib/pricing/quote';

const COUNT_KEY = /^counts\[([a-z0-9-]{1,64})\]$/;
const MARKER_KEY = /^markers\[([a-z0-9-]{1,64})\]$/;
const isPosInt = (s: string) => /^\d{1,7}$/.test(s) && Number(s) > 0;

export function parseBalanceForm(
  fd: FormData | URLSearchParams,
): { inputs: QuoteLineInput[]; confirm: boolean } | null {
  const counts = new Map<string, number>();
  const markers = new Map<string, number>();
  for (const [k, v] of fd.entries()) {
    const val = typeof v === 'string' ? v.trim() : '';
    const c = k.match(COUNT_KEY);
    if (c) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      counts.set(c[1], Number(val));
      continue;
    }
    const m = k.match(MARKER_KEY);
    if (m) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      markers.set(m[1], Number(val));
    }
  }
  if (counts.size === 0) return null;
  const inputs: QuoteLineInput[] = [];
  for (const [slug, count] of counts) {
    const mk = markers.get(slug);
    inputs.push(
      mk && mk > 1 ? { serviceSlug: slug, count, markers: mk } : { serviceSlug: slug, count },
    );
  }
  return { inputs, confirm: fd.get('confirm') === 'true' };
}
