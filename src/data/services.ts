// src/data/services.ts
// Service offerings catalog. Source of truth for /services (grouped into
// priced and project-rate), the Service JSON-LD on that page, and the
// services block of /llms-full.txt. Prices themselves live only in
// src/data/pricing.ts and are rendered only on /pricing and the homepage
// strip; /services stays dollar-free by policy (tests/e2e/services.spec.ts).

export interface ServiceOffering {
  name: string;
  description?: string;
  /** `priced` rows have a rate card on /pricing; `project-rate` rows are quoted per request. */
  kind: 'priced' | 'project-rate';
  /** Section id on /pricing. Priced rows only. */
  pricingAnchor?: string;
  /** True when /quote can price the service today. Priced rows only.
   * Metagenomics flips to true with the configurator work (spec 2);
   * targeted eDNA is always a consultation and stays false. */
  configurable?: boolean;
}

export const serviceOfferings: ServiceOffering[] = [
  {
    name: 'Voucher-linked specimen barcoding',
    description:
      'Every specimen imaged, non-destructively extracted, COI-barcoded on Oxford Nanopore, and identified with a confidence rating. Other markers available.',
    kind: 'priced',
    pricingAnchor: 'barcoding',
    configurable: true,
  },
  {
    name: 'Environmental DNA (eDNA) metabarcoding',
    description:
      'Community-level detection from water, soil, sediment, or air samples, one marker or several stacked on the same samples.',
    kind: 'priced',
    pricingAnchor: 'metabarcoding',
    configurable: true,
  },
  {
    name: 'Metagenome and metatranscriptome sequencing',
    description:
      'All the DNA in a specimen, or the genes it and its microbes are actively using, on a dedicated long-read flow cell per specimen.',
    kind: 'priced',
    pricingAnchor: 'metagenomics',
    configurable: true,
  },
  {
    name: 'Targeted eDNA (qPCR) for one or more species',
    description:
      'Presence and abundance of specific species by qPCR, with custom assay development where no published assay exists.',
    kind: 'priced',
    pricingAnchor: 'targeted-edna',
    configurable: false,
  },
  {
    name: 'Study design',
    description: 'Best-practices consultation on sampling, replication, controls, and analysis.',
    kind: 'project-rate',
  },
  {
    name: 'Bioinformatic data analysis and interpretation',
    description: 'Read processing, taxonomy reconciliation, downstream statistics, written report.',
    kind: 'project-rate',
  },
  {
    name: 'Custom eDNA / qPCR assay design and validation',
    description:
      'New-species or cross-species assay design including primer/probe optimization and specificity validation.',
    kind: 'project-rate',
  },
  {
    name: 'Field collection assistance',
    description:
      'Sampling protocol development and field collection support. Bay Area projects in person; remote consult elsewhere.',
    kind: 'project-rate',
  },
];
