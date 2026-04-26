// src/data/services.ts
// Service offerings catalog for the BioKEA molecular sequencing service.
// Source of truth for /services page rendering, Service JSON-LD on the
// page, and the /api/capabilities.json endpoint. Engagements are
// project-rate and quoted per request — no published prices.

export interface ServiceOffering {
  name: string;
  description?: string;
}

export const serviceOfferings: ServiceOffering[] = [
  {
    name: 'Study design',
    description: 'Best-practices consultation on sampling, replication, controls, and analysis.',
  },
  {
    name: 'Bioinformatic data analysis and interpretation',
    description: 'Read processing, taxonomy reconciliation, downstream statistics, written report.',
  },
  {
    name: 'DNA-based identification of organisms (barcoding)',
    description:
      'Single-specimen barcode sequencing across COI, 16S, 18S, ITS, rbcL, matK, or custom primers.',
  },
  {
    name: 'qPCR / eDNA assay (single + multi-species)',
    description:
      'Quantitative PCR for environmental DNA detection of one or more target species in water, soil, or sediment samples.',
  },
  {
    name: 'Custom eDNA / qPCR assay design + validation',
    description:
      'New-species or cross-species assay design including primer/probe optimization and specificity validation.',
  },
  {
    name: 'Metabarcoding, metagenomics, and other custom analyses',
    description:
      'Community-level amplicon surveys, shotgun metagenomics, hybrid assemblies, and bespoke pipeline integration.',
  },
  {
    name: 'Field collection assistance',
    description:
      'Sampling protocol development and field collection support — Bay Area projects in person; remote consult elsewhere.',
  },
];
