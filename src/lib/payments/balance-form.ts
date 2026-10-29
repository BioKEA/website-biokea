// src/lib/payments/balance-form.ts
//
// Parses the balance form (POST body on submit, query string on the admin
// page's preview round-trip). Split out of the API route module: the route
// imports the payments gateway, and dragging that into the admin page's
// module graph broke Vite's dev SSR resolution.
import type { LineKind, QuoteLineInput } from '@/lib/pricing/quote';

// Keys are `counts[<lineKey>]` / `markers[<lineKey>]`, lineKey being
// `<kind>:<slug>:<assay?>` (see lineKey in quote.ts), so two lines that share
// a slug (an mg and an mt assay; barcoding and its id-only run) stay apart.
const LINE_KEY = '([a-z-]+:[a-z0-9-]{1,64}:(?:mg|mt)?)';
// The bare-slug keys the admin form sent before line kinds. Still accepted
// for one release so a preview link built by the old form round-trips; a
// bare slug is always a plain service line.
const LEGACY_KEY = '([a-z0-9-]{1,64})';
const COUNT_KEY = new RegExp(`^counts\\[(?:${LINE_KEY}|${LEGACY_KEY})\\]$`);
const MARKER_KEY = new RegExp(`^markers\\[(?:${LINE_KEY}|${LEGACY_KEY})\\]$`);
const KINDS: readonly LineKind[] = ['service', 'id-only', 'preservative-edna', 'assay'];
const isPosInt = (s: string) => /^\d{1,7}$/.test(s) && Number(s) > 0;
const keyOf = (m: RegExpMatchArray) => m[1] ?? `service:${m[2]}:`;

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
      counts.set(keyOf(c), Number(val));
      continue;
    }
    const m = k.match(MARKER_KEY);
    if (m) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      markers.set(keyOf(m), Number(val));
    }
  }
  if (counts.size === 0) return null;
  const inputs: QuoteLineInput[] = [];
  for (const [key, count] of counts) {
    const [kind, serviceSlug, assay] = key.split(':') as [LineKind, string, '' | 'mg' | 'mt'];
    if (!KINDS.includes(kind)) return null;
    // Built field by field so a plain service line comes out exactly as it
    // did before kinds — { serviceSlug, count, markers? } — and stored
    // actual_lines for legacy quotes keep their shape.
    const input: QuoteLineInput = { serviceSlug, count };
    const mk = markers.get(key);
    if (mk && mk > 1) input.markers = mk;
    if (kind !== 'service') input.kind = kind;
    if (assay) input.assay = assay;
    inputs.push(input);
  }
  return { inputs, confirm: fd.get('confirm') === 'true' };
}
