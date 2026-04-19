// src/data/projects.ts

export type ProjectStatus = 'live' | 'revealing-soon' | 'coming-soon';

export interface Project {
  slug: string;
  title: string;
  summary: string;
  type: string;
  partner?: string;
  year: string;
  tags: string[];
  status: ProjectStatus;
  link?: string;
  hero?: string;
  heroAlt?: string;
  heroWidth?: number;
  heroHeight?: number;
  revealTarget?: string;
}

export const projects: Project[] = [
  {
    slug: 'california-intertidal-gap-analysis',
    title: 'Intertidal Biodiversity DNA Barcode Library',
    summary:
      'A reference barcode taxonomic coverage gap analysis tool — 4,384 intertidal species along the California coast, cross-referenced against BOLD, NCBI GenBank, NCBI SRA, and GBIF to prioritize which species to sample next.',
    type: 'Interactive Shiny app',
    partner: 'Coastal Quest',
    year: '2026',
    tags: ['eDNA', 'marine', 'gap analysis', 'DNA barcoding', 'California'],
    status: 'live',
    link: 'https://biokea.shinyapps.io/california_intertidal_gap_analysis/',
    hero: '/assets/images/project-intertidal-stats.webp',
    heroAlt:
      'Screenshot of the Intertidal Biodiversity DNA Barcode Library statistics dashboard showing 4,384 species, 15 million records, and coverage breakdowns across BOLD, NCBI, and SRA databases.',
    heroWidth: 1200,
    heroHeight: 675,
  },

  // VERIFY: placeholder stubs below. Replace with real upcoming projects
  // (or prune) before shipping publicly.
  {
    slug: 'smm-soil-edna-atlas',
    title: 'Santa Monica Mountains soil eDNA atlas',
    summary:
      'A mapped catalog of soil fungal and microbial diversity across Santa Monica Mountains transects — drawing on the LDC pilot processing pipeline.',
    type: 'Dataset + StoryMap',
    partner: 'California Institute of Biodiversity',
    year: '2026',
    tags: ['eDNA', 'soil', 'fungi', 'California'],
    status: 'revealing-soon',
    revealTarget: 'Q3 2026',
  },
  {
    slug: 'bay-estuary-metabarcoding-baseline',
    title: 'Bay estuary metabarcoding baseline',
    summary:
      'A longitudinal metabarcoding baseline for the San Francisco Bay estuary, in partnership with the San Francisco Estuary Institute.',
    type: 'Dataset + paper',
    partner: 'San Francisco Estuary Institute',
    year: '2026',
    tags: ['metabarcoding', 'marine', 'estuary', 'Bay Area'],
    status: 'revealing-soon',
    revealTarget: 'Q4 2026',
  },
  {
    slug: 'long-read-microbial-resource',
    title: 'Long-read microbial genome resource',
    summary:
      'A growing library of high-quality long-read microbial assemblies produced on the ONT Promethion 2 and published as a public resource.',
    type: 'Dataset',
    year: '2026–2027',
    tags: ['sequencing', 'microbial', 'long-read'],
    status: 'coming-soon',
    revealTarget: 'Q4 2026',
  },
  {
    slug: 'citizen-science-ingestion',
    title: 'Citizen-science sample ingestion',
    summary:
      'A lightweight intake + tracking pathway for citizen-submitted environmental samples routed through the LDC.',
    type: 'Tool + workflow',
    year: '2026–2027',
    tags: ['citizen science', 'community', 'sample intake'],
    status: 'coming-soon',
    revealTarget: '2027',
  },
];
