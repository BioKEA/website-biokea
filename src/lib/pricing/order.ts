// src/lib/pricing/order.ts
//
// Turns a customer's configurator choices (ProjectConfig) into pricing-engine
// inputs, consult triggers, "to be confirmed" rows, field errors and a
// plain-text summary. Pure: shared by the browser widget and the quote API
// (which recomputes server-side), so no I/O, no DOM, and no zod here — the
// schema lives in config-schema.ts.
import {
  markers as markerCatalog,
  materials as materialCatalog,
  sampleTypes,
  serviceChoices,
  targets as targetCatalog,
  type MarkerId,
  type MaterialId,
  type SampleTypeId,
  type ServiceSlug,
  type TargetId,
} from '@/data/configurator';
import {
  metagenomics,
  metagenomicsConversationThreshold,
  pricedServices,
  samplingKitPrice,
} from '@/data/pricing';
import { buildQuote, type Quote, type QuoteLineInput } from './quote';

export interface BarcodingConfig {
  service: 'barcoding';
  handling: 'voucher' | 'idOnly';
  target: TargetId;
  targetOther?: string;
  subs?: string[];
  markers: MarkerId[];
  markerOther?: string;
  sampleType: SampleTypeId;
  sampleOther?: string;
  samples: number;
  perSample?: number;
  uniqueOrganisms?: string;
  material?: MaterialId[];
  materialNotes?: string;
  preservativeEdna: boolean;
  kits: boolean;
  directions?: string;
}
export interface MetabarcodingConfig {
  service: 'metabarcoding';
  targets: TargetId[];
  targetOther?: string;
  subs?: Partial<Record<TargetId, string[]>>;
  markers: MarkerId[];
  markerOther?: string;
  sampleType: SampleTypeId;
  sampleOther?: string;
  samples: number;
  kits: boolean;
  directions?: string;
}
export interface MetagenomicsConfig {
  service: 'metagenomics';
  assays: ('mg' | 'mt')[];
  source: 'specimens' | 'environmental';
  envNotes?: string;
  count: number;
  directions?: string;
}
export interface TargetedEdnaConfig {
  service: 'targeted-edna';
  species: string;
  measure: 'presence' | 'abundance' | 'both' | 'unsure';
  assayExists: 'yes' | 'no' | 'unsure';
  sampleType: string;
  approxSamples?: number;
  directions?: string;
}
export type ProjectConfig =
  | BarcodingConfig
  | MetabarcodingConfig
  | MetagenomicsConfig
  | TargetedEdnaConfig;
export type TriggerKey =
  | 'target-other'
  | 'marker-other'
  | 'sample-type'
  | 'count-unknown'
  | 'unique-organisms'
  | 'kits'
  | 'environmental'
  | 'qpcr'
  | 'volume';
export interface ConsultTrigger {
  key: TriggerKey;
  label: string;
  detail: string;
}
/** A "to be confirmed" row: shown in the quote without an amount. */
export interface TbcLine {
  title: string;
  desc: string;
}
export interface Order {
  inputs: QuoteLineInput[];
  quote: Quote;
  triggers: ConsultTrigger[];
  tbc: TbcLine[];
  consult: boolean;
}

type Parts = Pick<Order, 'inputs' | 'triggers' | 'tbc'>;

const isCount = (n: number | undefined): n is number => Number.isInteger(n) && (n as number) >= 1;
const blank = (s: string | undefined) => !s || s.trim() === '';
const text = (s: string | undefined) => (s ?? '').trim();

const markerLabel = (id: MarkerId) => markerCatalog.find((m) => m.id === id)?.label ?? id;
const sampleTypeOf = (id: SampleTypeId) => sampleTypes.find((s) => s.id === id);
/** "Invertebrates (plankton, insects, worms, etc.)" → "Invertebrates". */
const targetName = (id: TargetId) =>
  (targetCatalog.find((t) => t.id === id)?.label ?? id).split(' (')[0];

/** Samples × organisms per sample; null when no per-sample maximum is set. */
export function barcodingCount(c: BarcodingConfig): number | null {
  return c.perSample === undefined ? null : c.samples * c.perSample;
}

const barcodingThreshold = pricedServices.find(
  (s) => s.slug === 'barcoding',
)?.conversationThreshold;

/** True when a barcoding project is large enough to need a conversation. */
function overVolume(c: BarcodingConfig): boolean {
  const count = barcodingCount(c);
  return count !== null && barcodingThreshold !== undefined && count >= barcodingThreshold;
}

/** Target, marker and sample-type triggers shared by barcoding and eDNA. */
function choiceTriggers(
  c: BarcodingConfig | MetabarcodingConfig,
  targetIds: TargetId[],
): ConsultTrigger[] {
  const out: ConsultTrigger[] = [];
  if (targetIds.includes('other')) {
    out.push({ key: 'target-other', label: 'Target organism: Other', detail: text(c.targetOther) });
  }
  if (c.markers.includes('other')) {
    out.push({ key: 'marker-other', label: 'Marker: Other', detail: text(c.markerOther) });
  }
  const st = sampleTypeOf(c.sampleType);
  if (st?.consult) {
    out.push({
      key: 'sample-type',
      label: `Sample type: ${st.label}`,
      detail: text(c.sampleOther),
    });
  }
  return out;
}

function kitsParts(samples: number, parts: Parts): void {
  const title = `Sampling kits (${samples})`;
  const desc = `${samples} × $${samplingKitPrice}, confirmed in consultation`;
  parts.triggers.push({ key: 'kits', label: title, detail: desc });
  parts.tbc.push({ title, desc });
}

function barcodingOrder(c: BarcodingConfig): Parts {
  const kind = c.handling === 'idOnly' ? 'id-only' : 'service';
  const count = barcodingCount(c);
  const markers = c.markers.length;
  const parts: Parts = { inputs: [], triggers: choiceTriggers(c, [c.target]), tbc: [] };
  if (count === null) {
    const base =
      kind === 'id-only' ? 'Specimen barcoding, identification only' : 'Specimen barcoding';
    const first = c.markers[0] ? ` (${markerLabel(c.markers[0])})` : '';
    parts.tbc.push({
      title: `${base}${first}`,
      desc: 'Number of specimens confirmed in consultation',
    });
    parts.triggers.push({
      key: 'count-unknown',
      label: 'Number of specimens',
      detail: `${c.samples} samples, no maximum organisms per sample`,
    });
    if (!blank(c.uniqueOrganisms)) {
      parts.triggers.push({
        key: 'unique-organisms',
        label: 'Specimen selection: focus on unique organisms',
        detail: text(c.uniqueOrganisms),
      });
    }
  } else {
    parts.inputs.push({ serviceSlug: 'barcoding', count, markers, kind });
  }
  if (c.preservativeEdna) {
    parts.inputs.push({
      serviceSlug: 'metabarcoding',
      kind: 'preservative-edna',
      count: c.samples,
      markers,
    });
  }
  if (c.kits) kitsParts(c.samples, parts);
  return parts;
}

function metabarcodingOrder(c: MetabarcodingConfig): Parts {
  const parts: Parts = {
    inputs: [
      {
        serviceSlug: 'metabarcoding',
        count: c.samples,
        markers: c.markers.length,
        kind: 'service',
      },
    ],
    triggers: choiceTriggers(c, c.targets),
    tbc: [],
  };
  if (c.kits) kitsParts(c.samples, parts);
  return parts;
}

function metagenomicsOrder(c: MetagenomicsConfig): Parts {
  const triggers: ConsultTrigger[] =
    c.source === 'environmental'
      ? [{ key: 'environmental', label: 'Environmental samples', detail: text(c.envNotes) }]
      : [];
  // The count applies to each selected assay, so the threshold is per assay.
  if (c.count >= metagenomicsConversationThreshold) {
    triggers.push({ key: 'volume', label: 'Volume', detail: `${c.count} specimens` });
  }
  return {
    inputs: c.assays.map((assay) => ({
      serviceSlug: 'metagenomics',
      kind: 'assay',
      assay,
      count: c.count,
    })),
    triggers,
    tbc: [],
  };
}

function targetedEdnaOrder(c: TargetedEdnaConfig): Parts {
  return {
    inputs: [],
    triggers: [
      { key: 'qpcr', label: 'Targeted eDNA (qPCR) custom quote', detail: text(c.species) },
    ],
    tbc: [],
  };
}

function partsFor(config: ProjectConfig): Parts {
  switch (config.service) {
    case 'barcoding':
      return barcodingOrder(config);
    case 'metabarcoding':
      return metabarcodingOrder(config);
    case 'metagenomics':
      return metagenomicsOrder(config);
    case 'targeted-edna':
      return targetedEdnaOrder(config);
  }
}

export function buildOrder(config: ProjectConfig): Order {
  const { inputs, triggers, tbc } = partsFor(config);
  const quote = buildQuote(inputs);
  // The engine flags the voucher-linked line, but the identification-only
  // line has no threshold of its own: the volume consult applies to the
  // barcoding project whichever handling the customer chose.
  if (config.service === 'barcoding' && (quote.needsConversation || overVolume(config))) {
    triggers.push({
      key: 'volume',
      label: 'Volume',
      detail: `${barcodingCount(config)} specimens`,
    });
  }
  return { inputs, quote, triggers, tbc, consult: triggers.length > 0 };
}

// Error copy is lifted from docs/source/mockups/order-configurator.html.
function validateChoices(
  c: BarcodingConfig | MetabarcodingConfig,
  targetIds: TargetId[],
  errs: Record<string, string>,
): void {
  // An unchosen select reads as '' in the widget; the schema would reject
  // it server-side, so say so next to the field instead.
  if (targetIds.filter(Boolean).length === 0) {
    errs[c.service === 'barcoding' ? 'target' : 'targets'] = 'Choose a target organism.';
  }
  if (targetIds.includes('other') && blank(c.targetOther)) {
    errs.targetOther = 'Describe the organisms you’re targeting.';
  }
  if (c.markers.length === 0) errs.markers = 'Choose at least one marker.';
  if (c.markers.includes('other') && blank(c.markerOther)) {
    errs.markerOther = 'Tell us which marker you need.';
  }
  if (!c.sampleType) errs.sampleType = 'Choose a sample type.';
  if (sampleTypeOf(c.sampleType)?.consult && blank(c.sampleOther)) {
    errs.sampleOther = 'Tell us a little about your samples.';
  }
}

export function validateConfig(config: ProjectConfig): Record<string, string> {
  const errs: Record<string, string> = {};
  const c = config;
  switch (c.service) {
    case 'barcoding':
      validateChoices(c, [c.target], errs);
      if (!isCount(c.samples)) errs.samples = 'Enter how many samples you’ll send.';
      if (c.perSample !== undefined && !isCount(c.perSample)) {
        errs.perSample = 'Enter the maximum organisms per sample as a whole number.';
      }
      if (c.uniqueOrganisms !== undefined && blank(c.uniqueOrganisms)) {
        errs.uniqueOrganisms = 'Describe your requested study design.';
      }
      if (c.material?.includes('other') && blank(c.materialNotes)) {
        errs.materialNotes = 'Describe the other material you’ll collect.';
      }
      break;
    case 'metabarcoding':
      validateChoices(c, c.targets, errs);
      if (!isCount(c.samples)) errs.samples = 'Enter the number of samples as a whole number.';
      break;
    case 'metagenomics':
      if (c.assays.length === 0) errs.assays = 'Choose metagenome, metatranscriptome, or both.';
      if (!isCount(c.count)) errs.count = 'Enter a whole number.';
      if (c.source === 'environmental' && blank(c.envNotes)) {
        errs.envNotes = 'Describe your environmental samples.';
      }
      break;
    case 'targeted-edna':
      if (blank(c.species)) errs.species = 'Tell us which species you’re interested in.';
      if (blank(c.sampleType)) errs.sampleType = 'Choose a sample type.';
      break;
  }
  return errs;
}

/**
 * "Voucher-Linked Specimen Barcoding" → "Voucher-linked specimen barcoding".
 * Only plain capitalised words are lowered, so DNA and eDNA survive.
 */
function sentenceCase(title: string): string {
  let first = true;
  return title.replace(/[A-Za-z]+/g, (w) => {
    const keep = first || !/^[A-Z][a-z]+$/.test(w);
    first = false;
    return keep ? w : w.toLowerCase();
  });
}

function serviceTitle(slug: ServiceSlug): string {
  return sentenceCase(serviceChoices.find((s) => s.slug === slug)?.title ?? slug);
}

function markersLine(c: BarcodingConfig | MetabarcodingConfig): string {
  const names = c.markers.map((m) =>
    m === 'other' ? `Other (${text(c.markerOther)})` : markerLabel(m),
  );
  return `Markers: ${names.join(', ')}`;
}

function sampleTypeLine(c: BarcodingConfig | MetabarcodingConfig): string {
  const st = sampleTypeOf(c.sampleType);
  const label = st?.label ?? c.sampleType;
  return st?.consult ? `Sample type: ${label} (${text(c.sampleOther)})` : `Sample type: ${label}`;
}

function targetText(id: TargetId, subs: string[] | undefined, other: string | undefined): string {
  if (id === 'other') return `Other (${text(other)})`;
  return subs?.length ? `${targetName(id)} (${subs.join(', ')})` : targetName(id);
}

function barcodingSummary(c: BarcodingConfig): string[] {
  const lines = [
    `Handling: ${c.handling === 'idOnly' ? 'Identification only, no voucher' : 'Voucher-linked'}`,
    `Target: ${targetText(c.target, c.subs, c.targetOther)}`,
    markersLine(c),
    sampleTypeLine(c),
    c.perSample === undefined
      ? `Samples: ${c.samples}, organisms per sample to be confirmed`
      : `Samples: ${c.samples}, up to ${c.perSample} organisms each`,
  ];
  if (c.uniqueOrganisms !== undefined) {
    lines.push(`Specimen selection: focus on unique organisms — ${text(c.uniqueOrganisms)}`);
  }
  if (c.material?.length) {
    const names = c.material.map((m) =>
      m === 'other'
        ? `Other (${text(c.materialNotes)})`
        : (materialCatalog.find((x) => x.id === m)?.label ?? m),
    );
    lines.push(`Material from animals: ${names.join(', ')}`);
  }
  if (c.preservativeEdna) lines.push('Add-on: bulk eDNA from preservative');
  if (c.kits) lines.push(`Sampling kits: ${c.samples} (to be confirmed)`);
  return lines;
}

function metabarcodingSummary(c: MetabarcodingConfig): string[] {
  const targets = c.targets.map((t) => targetText(t, c.subs?.[t], c.targetOther));
  const lines = [
    `Targets: ${targets.join('; ')}`,
    markersLine(c),
    sampleTypeLine(c),
    `Samples: ${c.samples}`,
  ];
  if (c.kits) lines.push(`Sampling kits: ${c.samples} (to be confirmed)`);
  return lines;
}

function metagenomicsSummary(c: MetagenomicsConfig): string[] {
  const assays = c.assays.map((id) => metagenomics.assays.find((a) => a.id === id)?.title ?? id);
  return [
    `Sequencing: ${assays.join(' and ')}`,
    c.source === 'environmental'
      ? `Source: environmental samples — ${text(c.envNotes)}`
      : 'Source: single specimens',
    `${c.source === 'environmental' ? 'Samples' : 'Specimens'}: ${c.count}`,
  ];
}

const measureText: Record<TargetedEdnaConfig['measure'], string> = {
  presence: 'Presence/absence',
  abundance: 'Relative abundance',
  both: 'Presence/absence and relative abundance',
  unsure: 'Not sure',
};
const assayExistsText: Record<TargetedEdnaConfig['assayExists'], string> = {
  yes: 'Yes',
  no: 'No',
  unsure: 'Not sure',
};

function targetedEdnaSummary(c: TargetedEdnaConfig): string[] {
  const lines = [
    `Species of interest: ${text(c.species)}`,
    `Measurement: ${measureText[c.measure]}`,
    `Existing assay: ${assayExistsText[c.assayExists]}`,
    `Sample type: ${text(c.sampleType)}`,
  ];
  if (c.approxSamples !== undefined) {
    lines.push(`Approximate number of samples: ${c.approxSamples}`);
  }
  return lines;
}

function serviceSummary(config: ProjectConfig): string[] {
  switch (config.service) {
    case 'barcoding':
      return barcodingSummary(config);
    case 'metabarcoding':
      return metabarcodingSummary(config);
    case 'metagenomics':
      return metagenomicsSummary(config);
    case 'targeted-edna':
      return targetedEdnaSummary(config);
  }
}

/** Plain-text lines for emails and the draft-order note. */
export function summarizeConfig(config: ProjectConfig): string[] {
  // The barcoding title says "voucher-linked"; an identification-only order
  // must not tell the lab to keep vouchers.
  const title =
    config.service === 'barcoding' && config.handling === 'idOnly'
      ? 'Specimen barcoding (identification only)'
      : serviceTitle(config.service);
  const lines = [`Service: ${title}`, ...serviceSummary(config)];
  if (!blank(config.directions)) lines.push(`Directions: ${text(config.directions)}`);
  return lines;
}
