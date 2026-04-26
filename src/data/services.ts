// src/data/services.ts
// Service catalog and pricing for the BioKEA molecular sequencing service.
// Source of truth for /services page rendering, Service JSON-LD on the
// page, and the /api/capabilities.json endpoint.

export interface ServiceFee {
  name: string;
  description?: string;
  // Either a fixed price string (e.g., "$25 / sample") OR quote: true.
  // priceNote is an optional second line for tier/qualifier info.
  price?: string;
  priceNote?: string;
  quote?: boolean;
}

export const serviceFees: ServiceFee[] = [
  {
    name: 'Study design',
    description: 'Best-practices consultation on sampling, replication, controls, and analysis.',
    price: '$150 / hour',
  },
  {
    name: 'Bioinformatic data analysis and interpretation',
    description: 'Read processing, taxonomy reconciliation, downstream statistics, written report.',
    price: '$150 / hour',
  },
  {
    name: 'DNA-based identification of organisms (barcoding)',
    description:
      'Single-specimen barcode sequencing across COI, 16S, 18S, ITS, rbcL, matK, or custom primers.',
    price: '$25 / sample',
  },
  {
    name: 'qPCR / eDNA assay',
    description:
      'Quantitative PCR for environmental DNA detection of a target species in water, soil, or sediment samples.',
    price: '$100 / sample (single species)',
    priceNote: '$50 / sample for each additional species in the same assay',
  },
  {
    name: 'Custom eDNA / qPCR assay design + validation',
    description:
      'New-species or cross-species assay design including primer/probe optimization and specificity validation.',
    quote: true,
  },
  {
    name: 'Metabarcoding, metagenomics, and other custom analyses',
    description:
      'Community-level amplicon surveys, shotgun metagenomics, hybrid assemblies, and bespoke pipeline integration.',
    quote: true,
  },
  {
    name: 'Field collection assistance',
    description:
      'Sampling protocol development and field collection support — Bay Area projects in person; remote consult elsewhere.',
    quote: true,
  },
];
