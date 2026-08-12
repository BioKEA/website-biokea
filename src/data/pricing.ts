// src/data/pricing.ts
// Published pricing for BioKEA's two fixed-rate, volume-tiered sequencing
// offerings. Source of truth for /pricing page rendering and its JSON-LD
// Offer/priceSpecification nodes. Every other offering in services.ts
// remains project-rate, quoted per request — this file covers only the
// two that have a clean per-unit rate card.

export interface PriceTier {
  range: string; // display label, e.g. "1–300"
  description: string;
  academicPrice: number;
  commercialPrice: number;
  minQty: number;
  maxQty?: number; // undefined = open-ended top tier
  best?: boolean;
}

export interface PricedService {
  slug: string;
  serviceTag: string;
  title: string;
  tagline: string;
  description: string;
  advantages: { title: string; body: string }[];
  included: string[];
  unitLabel: string; // "specimen" | "sample"
  tiers: PriceTier[];
  addonNote: string;
}

export const pricedServices: PricedService[] = [
  {
    slug: 'barcoding',
    serviceTag: 'Specimen-Level Identification',
    title: 'Voucher-Linked Specimen Barcoding',
    tagline: 'Identify individual specimens, down to species.',
    description:
      'Every specimen is imaged, extracted, and DNA-barcoded — giving you a species-level identification, a preserved voucher image, and a reference sequence for each one. Built for bulk-sorted bycatch, biodiversity surveys, and museum & collection backlogs.',
    advantages: [
      {
        title: 'Specimen-level confirmation',
        body: 'A confirmed ID tied to one physical, re-examinable voucher — not just a community-level signal.',
      },
      {
        title: 'A useful complement to eDNA',
        body: 'Ground-truth eDNA detections, or build the reference sequences your eDNA assays are matched against.',
      },
      {
        title: 'Voucher & image, included',
        body: 'Every specimen is preserved and imaged, so results can be re-checked or re-examined anytime.',
      },
    ],
    included: [
      'Non-destructive extraction of every specimen (voucher preserved)',
      'DNA extraction, per specimen',
      'COI barcode amplification & library preparation',
      'Oxford Nanopore sequencing',
      'Species-level ID against reference databases',
      'Digital report: image + barcode sequence + taxonomic ID per specimen',
    ],
    unitLabel: 'specimen',
    tiers: [
      {
        range: '1–300',
        description: 'Small batches & pilot runs',
        academicPrice: 16,
        commercialPrice: 20,
        minQty: 1,
        maxQty: 300,
      },
      {
        range: '300–1,000',
        description: 'Standard project size',
        academicPrice: 12,
        commercialPrice: 15,
        minQty: 300,
        maxQty: 1000,
      },
      {
        range: '1,000–5,000',
        description: 'Multi-flow-cell projects',
        academicPrice: 10,
        commercialPrice: 13,
        minQty: 1000,
        maxQty: 5000,
      },
      {
        range: '5,000+',
        description: 'Large-scale monitoring programs',
        academicPrice: 6,
        commercialPrice: 8,
        minQty: 5000,
        best: true,
      },
    ],
    addonNote:
      'Rates shown are per specimen at each volume tier. Contact us for volume commitments, recurring programs, or multi-project pricing.',
  },
  {
    slug: 'metabarcoding',
    serviceTag: 'Community-Level Detection',
    title: 'Environmental DNA (eDNA) Metabarcoding',
    tagline: 'Survey whole communities from a single sample.',
    description:
      'No specimens required. From an already-collected water, soil, sediment, or air sample, detect all species within your group of interest — fish, invertebrates, general eukaryotes, and more — using a targeted marker. Run one marker, or stack several in the same project.',
    advantages: [],
    included: [
      'Extraction from your already-collected samples (water, soil, sediment, or air filters)',
      'PCR amplification for each target marker',
      'Library indexing, pooling & Oxford Nanopore sequencing',
      'Bioinformatics: taxonomic assignment & quality control',
      'Digital report: full list of taxa detected within your target group, per sample',
    ],
    unitLabel: 'sample',
    tiers: [
      {
        range: '1–48',
        description: 'Small batches & pilot runs',
        academicPrice: 165,
        commercialPrice: 205,
        minQty: 1,
        maxQty: 48,
      },
      {
        range: '49–200',
        description: 'Standard project size',
        academicPrice: 130,
        commercialPrice: 160,
        minQty: 49,
        maxQty: 200,
      },
      {
        range: '200+',
        description: 'Large monitoring programs',
        academicPrice: 115,
        commercialPrice: 145,
        minQty: 200,
        best: true,
      },
    ],
    addonNote:
      'Running more than one marker? Each additional target (e.g. stacking fish + invertebrate + general-eukaryote panels on the same samples) typically adds $10–13/sample (academic/nonprofit) or $13–16/sample (commercial).',
  },
];
