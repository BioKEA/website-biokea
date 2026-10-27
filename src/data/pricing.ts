// src/data/pricing.ts
// Published pricing for BioKEA's sequencing services. Source of truth for
// /pricing, the homepage services strip, the Service/Offer JSON-LD on
// /pricing, and (via `pricedServices`) the quote widget and pricing engine.
//
// `pricedServices` holds the two volume-tiered offerings the quote widget
// and src/lib/pricing/quote.ts price today. Its shape and numbers are load-
// bearing for the money path; change them only with the engine (spec 2).
// Everything below it is page content added by the 2026-10-26 catalog spec.

export interface PriceTier {
  range: string; // display label, e.g. "1–299"
  description: string;
  academicPrice: number;
  commercialPrice: number;
  minQty: number;
  maxQty?: number; // undefined ONLY on the final, open-ended tier
  best?: boolean;
}

export interface Addon {
  title: string;
  body: string;
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
  addons: Addon[];
  // Per-unit surcharge for each marker beyond the first. eDNA only.
  additionalMarkerPrice?: { academic: number; commercial: number };
  // At or above this count, the configurator shows an indicative range
  // instead of a firm quote and routes to a conversation — covering both
  // the expensive dead zone and a sequencing-capacity check.
  conversationThreshold?: number;
}

/** Each marker after the first adds this fraction of the per-specimen tier rate. Barcoding only. */
export const barcodingExtraMarkerFraction = 0.75;

/** Per-sample surcharge for each marker beyond the first. eDNA only; the
 * engine reads it from `pricedServices[].additionalMarkerPrice`. */
export const ednaAdditionalMarkerPrice = { academic: 12, commercial: 15 };

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

export const pricedServices: PricedService[] = [
  {
    slug: 'barcoding',
    serviceTag: 'Specimen-level identification',
    title: 'Voucher-Linked Specimen Barcoding',
    tagline: 'Identify individual specimens, with a confidence rating on every result.',
    description:
      'Every specimen is imaged, DNA-barcoded, and identified to the finest level the reference data support. Each identification comes with a confidence rating, a preserved voucher image, and a reference sequence. Built for bulk-sorted bycatch, biodiversity surveys, and museum and collection backlogs.',
    advantages: [
      {
        title: 'Specimen-level confirmation',
        body: 'Every identification is tied to one physical, re-examinable voucher, not just a community-level signal.',
      },
      {
        title: 'A useful complement to eDNA',
        body: 'Ground-truth eDNA detections, or build the reference sequences your eDNA assays are matched against.',
      },
      {
        title: 'Voucher and image included',
        body: 'Every specimen is preserved and imaged, so results can be re-checked or re-examined at any time.',
      },
    ],
    included: [
      'Imaging and non-destructive DNA extraction of every specimen (voucher preserved)',
      'COI barcode sequencing on Oxford Nanopore',
      'Taxonomic identification against BOLD and NCBI reference databases',
      'A confidence rating for every identification',
      'Sample summary: species list, counts, and diversity per sample',
      'Quality controls on every plate, plus the reason for any specimen we couldn’t identify',
      'An interactive data dashboard, plus data files with the image, sequence, and ID for each specimen, ready for BOLD and GBIF',
    ],
    unitLabel: 'specimen',
    tiers: [
      {
        range: '1–299',
        description: 'Small batches and pilot runs',
        academicPrice: 16,
        commercialPrice: 20,
        minQty: 1,
        maxQty: 299,
      },
      {
        range: '300–999',
        description: 'Standard project size',
        academicPrice: 12,
        commercialPrice: 15,
        minQty: 300,
        maxQty: 999,
      },
      {
        range: '1,000–4,999',
        description: 'Multi-flow-cell projects',
        academicPrice: 10,
        commercialPrice: 13,
        minQty: 1000,
        maxQty: 4999,
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
    conversationThreshold: 3001,
    addons: [
      {
        title: 'Other or multiple markers',
        body: `16S, 18S, ITS, 12S, and more, in place of or alongside COI. Each added marker is ${pct(barcodingExtraMarkerFraction)} of your per-specimen rate.`,
      },
      {
        title: 'Bulk eDNA from the sample preservative',
        body: 'Detects taxa too small, damaged, or missed at sorting. Priced per sample at the eDNA metabarcoding rates, including any additional markers.',
      },
    ],
  },
  {
    slug: 'metabarcoding',
    serviceTag: 'Community-level detection',
    title: 'Environmental DNA (eDNA) Metabarcoding',
    tagline: 'Survey whole communities from a single sample.',
    description:
      'No specimens required. From an already-collected water, soil, sediment, or air sample, detect species within your group of interest, such as fish, invertebrates, or general eukaryotes, using a targeted marker. Run one marker, or stack several in the same project.',
    advantages: [],
    included: [
      'Extraction from your already-collected samples (water, soil, sediment, or air filters)',
      'PCR amplification for each target marker',
      'Library indexing, pooling, and Oxford Nanopore sequencing',
      'Bioinformatics: taxonomic assignment and quality control',
      'Digital report: full list of taxa detected within your target group, per sample',
    ],
    unitLabel: 'sample',
    tiers: [
      {
        range: '1–48',
        description: 'Small batches and pilot runs',
        academicPrice: 165,
        commercialPrice: 205,
        minQty: 1,
        maxQty: 48,
      },
      {
        range: '49–199',
        description: 'Standard project size',
        academicPrice: 130,
        commercialPrice: 160,
        minQty: 49,
        maxQty: 199,
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
    additionalMarkerPrice: ednaAdditionalMarkerPrice,
    addons: [
      {
        title: 'Additional markers',
        body: `Stack fish, invertebrate, and general-eukaryote panels on the same samples. $${ednaAdditionalMarkerPrice.academic} per sample, per added marker (academic and nonprofit) or $${ednaAdditionalMarkerPrice.commercial} (commercial).`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalog additions (2026-10-26). Page content only until spec 2 teaches the
// engine and the widget about them.

export const identificationOnlyBarcoding = {
  slug: 'barcoding-id-only',
  title: 'Identification only, no voucher',
  price: 5, // per specimen, flat, any volume, any client type
  description:
    'A lower-cost option when you don’t need specimens kept. You receive a DNA identification and confidence rating for each specimen, at a flat rate for any volume and any client type. Specimens aren’t retained as vouchers, but you’ll receive an image of each one in its sample well.',
} as const;

export const confidenceRatings: {
  level: 'High' | 'Moderate' | 'Unresolved';
  meaning: string;
}[] = [
  { level: 'High', meaning: 'Confident species-level match.' },
  { level: 'Moderate', meaning: 'Reliable to genus, or a close but not exact species match.' },
  {
    level: 'Unresolved',
    meaning: 'No close reference match. The specimen may be undescribed or not yet barcoded.',
  },
];

export interface Assay {
  id: 'mg' | 'mt';
  title: string;
  description: string;
  academicPrice: number;
  commercialPrice: number;
}

export const metagenomics = {
  slug: 'metagenomics',
  serviceTag: 'Whole-community sequencing',
  title: 'Metagenome and metatranscriptome sequencing',
  tagline: 'See everything living in and on a specimen, and what it’s doing.',
  description:
    'Available for single specimens. A metagenome sequences all the DNA in a specimen: the organism itself plus its microbiome, symbionts, and pathogens. A metatranscriptome sequences RNA to show which genes the specimen and its microbes are actively using.',
  included: [
    'High molecular weight DNA extraction (metagenome) or RNA extraction (metatranscriptome)',
    'Library preparation for long-read sequencing',
    'Oxford Nanopore sequencing on a dedicated flow cell for each specimen',
    'Data analysis',
    'Access to your data and visualizations in a custom dashboard',
  ],
  assays: [
    {
      id: 'mg',
      title: 'Metagenome',
      description: 'All the DNA in the specimen',
      academicPrice: 2400,
      commercialPrice: 3000,
    },
    {
      id: 'mt',
      title: 'Metatranscriptome',
      description: 'Active genes, from RNA',
      academicPrice: 3350,
      commercialPrice: 4200,
    },
  ] as Assay[],
  unitLabel: 'specimen',
  notes: [
    'Metatranscriptomes need specimens preserved for RNA, such as flash-frozen or stored in an RNA preservative.',
    'Working with environmental samples like water, soil, or sediment? We’ll consult on your project and quote at a similar rate.',
  ],
};

export const targetedEdna = {
  slug: 'targeted-edna',
  serviceTag: 'Species-specific detection',
  title: 'Targeted eDNA for one or more species',
  tagline: 'Custom quotes for detecting and measuring the species you care about.',
  description:
    'We specialize in applying qPCR to measure the presence and abundance of species in a variety of sample types, and in developing custom assays for species of interest. Reach out to discuss your needs and we’ll be happy to provide a custom quote.',
  customQuote: true as const,
};

/** Per kit, any sample type. Sold by the configurator from spec 2 onward. */
export const samplingKitPrice = 20;

export interface ComparisonRow {
  label: string;
  barcoding: string;
  metabarcoding: string;
  metagenomics: string;
  targetedEdna: string;
}

export const comparisonRows: ComparisonRow[] = [
  {
    label: 'What it tells you',
    barcoding: 'One identification per physical specimen, with a confidence rating.',
    metabarcoding:
      'Which taxa in your group of interest are present across a whole assemblage, based on the markers applied.',
    metagenomics:
      'All the DNA in a specimen, including its microbiome, symbionts, and pathogens, or which genes are active (from RNA).',
    targetedEdna:
      'Whether specific species are present and, if needed, how much of their DNA is in the sample.',
  },
  {
    label: 'Input required',
    barcoding: 'Physical specimens, sorted or bulk-collected.',
    metabarcoding: 'An already-collected water, soil, sediment, or air sample or filter.',
    metagenomics:
      'Single specimens. Metatranscriptomes need specimens preserved for RNA. Environmental samples by consultation.',
    targetedEdna: 'Water, soil, sediment, air, tissue, or swab samples.',
  },
  {
    label: 'Resolution',
    barcoding:
      'Individual specimen, with an image and, for voucher-linked barcoding, a preserved voucher.',
    metabarcoding:
      'Community-wide presence or absence across many taxa at once, not individual counts.',
    metagenomics:
      'Genome- and gene-level detail across the organisms in the specimen, from long reads.',
    targetedEdna:
      'One or a few target species, detected with high sensitivity. Measures DNA quantity, not individual counts.',
  },
  {
    label: 'Best for',
    barcoding:
      'Bulk-sorted bycatch, biodiversity surveys, museum and collection backlogs, reference-library building.',
    metabarcoding:
      'Rapid biodiversity screening, monitoring cryptic or elusive species, sites where physical collection is impractical.',
    metagenomics:
      'Host-microbe and symbiont studies, pathogen screening, and understanding what an organism and its microbes are doing.',
    targetedEdna:
      'Early detection of invasive species, monitoring rare or listed species, tracking a known pest or pathogen.',
  },
  {
    label: 'Pricing',
    barcoding: 'Per specimen, by volume tier.',
    metabarcoding: 'Per sample, by volume tier.',
    metagenomics: 'Per specimen.',
    targetedEdna: 'Custom quote.',
  },
];

/** Display order and anchors for /pricing, the homepage strip, and in-page nav. */
export const pricingSections: { id: string; label: string }[] = [
  { id: 'barcoding', label: 'Barcoding' },
  { id: 'metabarcoding', label: 'eDNA' },
  { id: 'metagenomics', label: 'Metagenomics' },
  { id: 'targeted-edna', label: 'Targeted eDNA' },
];

/**
 * Honest price range for a service across all tiers and both audiences.
 * `null` for custom-quote services and unknown slugs. Used wherever a page
 * summarises a service in one line, so "from $6" never appears: only the
 * largest academic programme gets that rate.
 */
export function priceRange(slug: string): { min: number; max: number; unit: string } | null {
  const svc = pricedServices.find((s) => s.slug === slug);
  if (svc) {
    const all = svc.tiers.flatMap((t) => [t.academicPrice, t.commercialPrice]);
    return { min: Math.min(...all), max: Math.max(...all), unit: svc.unitLabel };
  }
  if (slug === metagenomics.slug) {
    const all = metagenomics.assays.flatMap((a) => [a.academicPrice, a.commercialPrice]);
    return { min: Math.min(...all), max: Math.max(...all), unit: metagenomics.unitLabel };
  }
  return null;
}
