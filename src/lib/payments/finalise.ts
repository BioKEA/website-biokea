// src/lib/payments/finalise.ts
//
// Firming up a consult quote (spec 3:
// docs/superpowers/specs/2026-10-29-consult-finalisation-design.md).
// Pure: the admin page uses it to render and preview the form, the
// finalise endpoint to validate and price it. Like balance-form.ts this
// stays free of the gateway import so the admin page's module graph does
// not pull in the Shopify client.
import {
  buildQuote,
  lineKey,
  type LineKind,
  type Quote,
  type QuoteLine,
  type QuoteLineInput,
} from '@/lib/pricing/quote';
import type { PaymentRecord, QuoteRecord, QuoteStatus } from './types';

/** Rows the form offers: every rate-card line kind, plus a custom price. */
export const FIRM_ROW_TYPES: readonly { value: string; label: string; markers: boolean }[] = [
  { value: 'service:barcoding:', label: 'Specimen barcoding (voucher-linked)', markers: true },
  { value: 'id-only:barcoding:', label: 'Specimen barcoding, identification only', markers: true },
  { value: 'service:metabarcoding:', label: 'eDNA metabarcoding', markers: true },
  {
    value: 'preservative-edna:metabarcoding:',
    label: 'Bulk eDNA from preservative',
    markers: true,
  },
  { value: 'assay:metagenomics:mg', label: 'Metagenome sequencing', markers: false },
  { value: 'assay:metagenomics:mt', label: 'Metatranscriptome sequencing', markers: false },
  { value: 'custom', label: 'Custom line (agreed price)', markers: false },
];

/** How many empty rows the form adds below the stored lines. */
export const BLANK_ROWS = 3;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 180;
export const MAX_NOTE = 2000;
const MAX_ROWS = 20;

/**
 * The status the firm quote is written from, or null when this quote can't
 * be firmed up here. Covers a consult quote, a legacy volume quote
 * (`quoted` + `needs_conversation`), and a quote the lab already firmed up
 * and may still revise — always only while no payment is live on it.
 */
export function finaliseFrom(quote: QuoteRecord, payments: PaymentRecord[]): QuoteStatus | null {
  const livePayment = payments.some(
    (p) => p.status === 'open' || p.status === 'paid' || p.status === 'settled',
  );
  if (livePayment) return null;
  if (quote.status === 'consult') return 'consult';
  if (quote.status === 'quoted' && (quote.needs_conversation || quote.finalised_at))
    return 'quoted';
  return null;
}

export interface FormRow {
  type: string;
  count: string;
  markers: string;
  title: string;
  unit: string;
  academic: string;
  commercial: string;
}

const blankRow = (): FormRow => ({
  type: '',
  count: '',
  markers: '',
  title: '',
  unit: '',
  academic: '',
  commercial: '',
});

/** The form's starting rows: one per stored line, then BLANK_ROWS empty ones. */
export function formRows(lines: QuoteLine[]): FormRow[] {
  const rows = lines.map((l): FormRow => {
    if (l.kind === 'custom' && l.custom) {
      return {
        ...blankRow(),
        type: 'custom',
        count: String(l.count),
        title: l.custom.title,
        unit: l.custom.unitLabel,
        academic: String(l.custom.academic),
        commercial: String(l.custom.commercial),
      };
    }
    return {
      ...blankRow(),
      type: lineKey(l),
      count: String(l.count),
      markers: l.markers > 1 ? String(l.markers) : '',
    };
  });
  return [...rows, ...Array.from({ length: BLANK_ROWS }, blankRow)];
}

const ROW_FIELD = /^rows\[(\d{1,2})\]\[(type|count|markers|title|unit|academic|commercial)\]$/;

/**
 * Rows as submitted (or bounced back for preview), keyed by the row's own
 * index so an error can be shown next to the row the staff member typed in.
 */
export function submittedRows(fd: FormData | URLSearchParams): Map<number, FormRow> {
  const byIndex = new Map<number, FormRow>();
  for (const [k, v] of fd.entries()) {
    const m = k.match(ROW_FIELD);
    if (!m || typeof v !== 'string' || +m[1] >= MAX_ROWS) continue;
    const row = byIndex.get(+m[1]) ?? blankRow();
    row[m[2] as keyof FormRow] = v;
    byIndex.set(+m[1], row);
  }
  return new Map([...byIndex.entries()].sort(([a], [b]) => a - b));
}

export type FinaliseForm =
  | { ok: true; inputs: QuoteLineInput[]; days: number; note: string | null; confirm: boolean }
  | { ok: false; errors: Record<string, string> };

const isPosInt = (s: string, max: number) => /^\d{1,7}$/.test(s) && +s >= 1 && +s <= max;
// Dollars, at most two decimals, > 0 and ≤ $1,000,000.
const isPrice = (s: string) => /^\d{1,7}(\.\d{1,2})?$/.test(s) && +s > 0 && +s <= 1_000_000;
const oneLine = /^[^\r\n]*$/;

export function parseFinaliseForm(fd: FormData | URLSearchParams): FinaliseForm {
  const errors: Record<string, string> = {};
  const inputs: QuoteLineInput[] = [];
  const seen = new Set<string>();
  let customN = 0;

  for (const [i, raw] of submittedRows(fd)) {
    const r = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v.trim()]),
    ) as unknown as FormRow;
    const f = (name: keyof FormRow) => `rows[${i}][${name}]`;
    if (r.type === '') continue; // a blank row
    const type = FIRM_ROW_TYPES.find((t) => t.value === r.type);
    if (!type) {
      errors[f('type')] = 'Choose a line type.';
      continue;
    }
    if (!isPosInt(r.count, 1_000_000)) {
      errors[f('count')] = 'Count must be a whole number from 1.';
      continue;
    }
    const count = +r.count;
    let markers = 1;
    if (r.markers !== '') {
      if (!isPosInt(r.markers, 20)) {
        errors[f('markers')] = 'Markers must be a whole number from 1 to 20.';
        continue;
      }
      markers = +r.markers;
      if (markers > 1 && !type.markers) {
        errors[f('markers')] = 'This line type has no marker option.';
        continue;
      }
    }

    if (type.value === 'custom') {
      let bad = false;
      if (!r.title || r.title.length > 120 || !oneLine.test(r.title)) {
        errors[f('title')] = 'Give the line a title (one line, up to 120 characters).';
        bad = true;
      }
      if (!/^[a-z][a-z -]{0,23}$/i.test(r.unit)) {
        errors[f('unit')] = 'Unit: a word such as kit, assay or project.';
        bad = true;
      }
      if (!isPrice(r.commercial)) {
        errors[f('commercial')] = 'Commercial price per unit, in dollars (e.g. 22 or 18.50).';
        bad = true;
      }
      if (r.academic !== '' && !isPrice(r.academic)) {
        errors[f('academic')] = 'Academic price per unit, in dollars, or blank for the same.';
        bad = true;
      }
      if (bad) continue;
      if (++customN > 99) {
        errors[f('type')] = 'Too many custom lines.';
        continue;
      }
      const commercial = +r.commercial;
      inputs.push({
        serviceSlug: `custom-${customN}`,
        kind: 'custom',
        count,
        custom: {
          title: r.title,
          unitLabel: r.unit.toLowerCase(),
          academic: r.academic === '' ? commercial : +r.academic,
          commercial,
        },
      });
      continue;
    }

    // The balance form keys actual counts by line identity, so two lines
    // with the same identity could never be told apart at billing time.
    if (seen.has(type.value)) {
      errors[f('type')] = 'This line type is already listed — combine the counts into one row.';
      continue;
    }
    seen.add(type.value);
    const [kind, serviceSlug, assay] = type.value.split(':') as [LineKind, string, string];
    // Built field by field so a plain service line has exactly the shape the
    // quote API stores: { serviceSlug, count, markers? }.
    const input: QuoteLineInput = { serviceSlug, count };
    if (markers > 1) input.markers = markers;
    if (kind !== 'service') input.kind = kind;
    if (assay === 'mg' || assay === 'mt') input.assay = assay;
    inputs.push(input);
  }

  if (inputs.length === 0 && Object.keys(errors).length === 0) {
    errors.rows = 'Add at least one priced line.';
  }

  const daysRaw = (fd.get('days') ?? '').toString().trim();
  let days = DEFAULT_DAYS;
  if (daysRaw !== '') {
    if (!isPosInt(daysRaw, MAX_DAYS)) errors.days = `Days valid: 1 to ${MAX_DAYS}.`;
    else days = +daysRaw;
  }

  const noteRaw = (fd.get('note') ?? '').toString().trim();
  if (Array.from(noteRaw).length > MAX_NOTE)
    errors.note = `Keep the note under ${MAX_NOTE} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    inputs,
    days,
    note: noteRaw === '' ? null : noteRaw.replace(/\r\n/g, '\n'),
    confirm: fd.get('confirm') === 'true',
  };
}

/**
 * The engine's price for the firm lines. The lab has had the conversation,
 * so nothing on a firm quote still "needs" one, whatever the volume.
 */
export function firmQuote(inputs: QuoteLineInput[]): Quote {
  const q = buildQuote(inputs);
  return {
    ...q,
    lines: q.lines.map((l) => ({ ...l, needsConversation: false })),
    needsConversation: false,
  };
}

/**
 * firmQuote plus the checks the preview and the endpoint share: the engine
 * accepts the lines, and the quote is worth at least $1 at either rate
 * (the pay endpoint refuses anything less, so a smaller firm quote could
 * never be paid).
 */
export function priceFirm(
  inputs: QuoteLineInput[],
): { ok: true; quote: Quote } | { ok: false; error: string } {
  let quote: Quote;
  try {
    quote = firmQuote(inputs);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'These lines cannot be priced.',
    };
  }
  if (quote.total.academic < 1 || quote.total.commercial < 1) {
    return { ok: false, error: 'The quote must total at least $1 at both rates.' };
  }
  return { ok: true, quote };
}
