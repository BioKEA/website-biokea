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
  heroes?: string[]; // optional multi-image variant; renders side-by-side
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
    hero: '/assets/images/Cal-Sampling-Map.png',
    heroAlt:
      'Sampling-effort map of California showing geographic spread of insect specimens barcoded under the California Insect Barcoding Initiative.',
    heroWidth: 1122,
    heroHeight: 1402,
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
    heroes: [
      '/assets/images/DaKine-Divers-Screen1.png',
      '/assets/images/DaKine-Divers-Screen2.png',
    ],
    heroAlt:
      "DaKineDiving interactive map of O'ahu showing dive sites, real-time conditions, and marine biodiversity overlays",
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
        label: 'Walkthrough · additional biology features',
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
    hero: '/assets/images/eDNA-SF.png',
    heroAlt:
      'Map of the San Francisco Bay-Delta estuary showing eDNA sampling stations for the metabarcoding baseline.',
    heroWidth: 1448,
    heroHeight: 1086,
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
    hero: '/assets/images/Long-Read-Resource.png',
    heroAlt:
      'Visualization of a long-read microbial genome assembly produced on the ONT Promethion 2.',
    heroWidth: 1672,
    heroHeight: 941,
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
    hero: '/assets/images/Colloquip.png',
    heroAlt:
      'Colloquip multi-agent deliberation interface showing specialized scientific personas debating a hypothesis.',
    heroWidth: 758,
    heroHeight: 562,
    team: [{ name: 'Sunit', lead: true }],
    originIndependent: true,
    originNote:
      "Originated and maintained independently by Sunit Jain on GitHub; surfaced here through Sunit's advisor role, not authored by BioKEA.",
  },
  {
    slug: 'sequoia-foundation-model',
    title: 'Sequoia™ — a foundation model for global biodiversity',
    summary:
      "BioKEA's multimodal foundation model: it learns biology from DNA, images, and the spatial environment all at once — what an organism is, what it looks like, and where it lives. Reads partial DNA, fragmentary photographs, and habitat maps as one signal. Two tiers: the Seed (a small, single-file model that runs on a laptop, for education and open collaboration) and the Forest (the production engine that processes hundreds of millions of biodiversity datapoints).",
    type: 'AI foundation model',
    year: '2026–2027',
    tags: ['AI', 'foundation model', 'multimodal', 'biodiversity', 'computer vision', 'DNA'],
    status: 'coming-soon',
    revealTarget: '2027',
    hero: '/assets/images/sequoia-foundation-model.jpg',
    heroAlt:
      'Sequoia title slide — a redwood canopy seen from below, with a stylized golden tree-ring icon at the center, and the words "Introducing Sequoia: BioKEA\'s Foundation Model for Global Biodiversity. A Living Brain for the Natural World."',
    heroWidth: 1600,
    heroHeight: 893,
    team: [{ name: 'Sean', lead: true }],
  },
];
