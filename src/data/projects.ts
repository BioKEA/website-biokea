// src/data/projects.ts

export type ProjectStatus = 'live' | 'revealing-soon' | 'coming-soon';

export interface ProjectMember {
  name: string;
  lead?: boolean;
}

export interface ProjectAward {
  label: string;
  url: string;
}

export interface ProjectVideo {
  label: string;
  url: string;
}

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
  team?: ProjectMember[];
  // Project originated outside BioKEA — the team member who owns it
  // brought it in or continues it independently. Surfaced on the card
  // so partners/LLMs can't mistake provenance.
  originIndependent?: boolean;
  originNote?: string;
  award?: ProjectAward;
  videos?: ProjectVideo[];
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
    team: [{ name: 'Sean', lead: true }],
  },

  // VERIFY: placeholder stubs below. Replace with real upcoming projects
  // (or prune) before shipping publicly. Team assignments below are also
  // placeholders — swap in real leads/contributors when confirmed.
  {
    slug: 'california-insect-barcoding',
    title: 'California Insect Barcoding Initiative',
    summary:
      'The first large-scale DNA-barcode survey of California insects — over 1 million specimens barcoded, estimating a conservative minimum of ~61,000 species statewide with roughly one third still undiscovered. Generates spatial richness interpolations constrained by ecoregion and vegetation type to guide targeted inventory and conservation.',
    type: 'Research paper + dataset',
    year: '2026',
    tags: ['DNA barcoding', 'insects', 'biodiversity', 'California', 'conservation'],
    status: 'revealing-soon',
    revealTarget: 'Pending Ecography publication',
    team: [{ name: 'Austin', lead: true }],
    originIndependent: true,
    originNote:
      "Originated independently of BioKEA as Austin's prior research program; now continued under the BioKEA umbrella.",
  },
  {
    slug: 'dakinediving',
    title: "DaKineDiving — real-time dive intelligence for O'ahu",
    summary:
      "A real-time dive intelligence platform for O'ahu, Hawai'i. Combines NOAA tide data, PacIOOS wave buoys, and GBIF biodiversity records to surface conditions, encounter probabilities for 100+ marine species, and Marine Life Conservation District boundaries on an interactive map. Built with Claude Sonnet 4.5.",
    type: 'Web application',
    year: '2025',
    tags: ['marine', 'biodiversity', 'GBIF', 'eDNA-adjacent', 'Hawaii', 'AI-assisted build'],
    status: 'live',
    team: [{ name: 'Sean', lead: true }],
    originIndependent: true,
    originNote:
      "Built by Sean as a solo entry to Anthropic's Built with Claude Sonnet 4.5 Challenge (October 2025); winner of the contest. Surfaced under BioKEA because of the GBIF biodiversity layer; not part of the BioKEA wet-lab pipeline.",
    award: {
      label: 'Built with Claude Sonnet 4.5 Challenge — Winner',
      url: 'https://x.com/alexalbert__/status/1978220407716245581',
    },
    videos: [
      {
        label: 'Walkthrough',
        url: 'https://drive.google.com/file/d/1eYVxautzXZERbk1Oez_VfE5xeEnx85dR/view?usp=drive_link',
      },
      {
        label: 'Walkthrough · biology features',
        url: 'https://drive.google.com/file/d/1artFfslcNR90__Jx9xeEAYPUDBjUkeAL/view?usp=sharing',
      },
    ],
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
    team: [{ name: 'Michelle', lead: true }, { name: 'Sean' }],
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
    team: [{ name: 'Sean', lead: true }],
  },
  {
    slug: 'colloquip',
    title: 'Colloquip — multi-agent scientific deliberation',
    summary:
      'An open-source multi-agent AI deliberation platform. Specialized scientific personas — Biology, Chemistry, ADMET, Clinical, Regulatory, Red Team — self-organize to debate hypotheses, with emergent discussion phases and energy-based conclusion instead of fixed turn orders.',
    type: 'Open-source platform',
    year: '2026',
    tags: ['AI', 'multi-agent', 'scientific reasoning', 'open source', 'deliberation'],
    status: 'live',
    link: 'https://github.com/sunitj/Colloquip',
    team: [{ name: 'Sunit', lead: true }],
    originIndependent: true,
    originNote:
      "Originated and maintained independently by Sunit Jain on GitHub; surfaced here through Sunit's advisor role, not authored by BioKEA.",
  },
];
