// src/lib/pricing/config-schema.ts
//
// Shape and bounds check for a ProjectConfig arriving at the quote API.
// Field-level rules ("describe the other marker") live in validateConfig in
// order.ts; this only guarantees the object is safe to hand to buildOrder.
// Kept apart from order.ts so the browser bundle never pulls in zod.
import { z } from 'zod';
import {
  markers,
  materials,
  sampleTypes,
  targets,
  type MarkerId,
  type MaterialId,
  type SampleTypeId,
  type TargetId,
} from '@/data/configurator';
import type { ProjectConfig } from './order';

const ids = <T extends string>(list: { id: T }[]) => list.map((x) => x.id) as [T, ...T[]];

const targetId = z.enum(ids<TargetId>(targets));
const markerId = z.enum(ids<MarkerId>(markers));
const sampleTypeId = z.enum(ids<SampleTypeId>(sampleTypes));
const materialId = z.enum(ids<MaterialId>(materials));

const freeText = z.string().trim().max(2000);
const count = z.number().int().positive().max(1_000_000);
const samples = count.max(100_000);
const subList = z.array(freeText).max(50);
const markerList = z.array(markerId).max(markers.length);

const barcoding = z.object({
  service: z.literal('barcoding'),
  handling: z.enum(['voucher', 'idOnly']),
  target: targetId,
  targetOther: freeText.optional(),
  subs: subList.optional(),
  markers: markerList,
  markerOther: freeText.optional(),
  sampleType: sampleTypeId,
  sampleOther: freeText.optional(),
  samples,
  perSample: count.max(1_000).optional(),
  uniqueOrganisms: freeText.optional(),
  material: z.array(materialId).max(materials.length).optional(),
  materialNotes: freeText.optional(),
  preservativeEdna: z.boolean(),
  kits: z.boolean(),
  directions: freeText.optional(),
});

const metabarcoding = z.object({
  service: z.literal('metabarcoding'),
  targets: z.array(targetId).max(targets.length),
  targetOther: freeText.optional(),
  subs: z.partialRecord(targetId, subList).optional(),
  markers: markerList,
  markerOther: freeText.optional(),
  sampleType: sampleTypeId,
  sampleOther: freeText.optional(),
  samples,
  kits: z.boolean(),
  directions: freeText.optional(),
});

const metagenomicsSchema = z.object({
  service: z.literal('metagenomics'),
  assays: z.array(z.enum(['mg', 'mt'])).max(2),
  source: z.enum(['specimens', 'environmental']),
  envNotes: freeText.optional(),
  count,
  directions: freeText.optional(),
});

const targetedEdna = z.object({
  service: z.literal('targeted-edna'),
  species: freeText,
  measure: z.enum(['presence', 'abundance', 'both', 'unsure']),
  assayExists: z.enum(['yes', 'no', 'unsure']),
  sampleType: freeText,
  approxSamples: count.optional(),
  directions: freeText.optional(),
});

export const ConfigSchema: z.ZodType<ProjectConfig> = z.discriminatedUnion('service', [
  barcoding,
  metabarcoding,
  metagenomicsSchema,
  targetedEdna,
]);
