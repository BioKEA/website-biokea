// src/data/works.ts
export interface WorksProduct {
  slug: string;
  name: string;
  subdomain: string;
  tagline: string;
  capabilities: string[];
}

export const worksProducts: WorksProduct[] = [
  {
    slug: 'works',
    name: 'Works',
    subdomain: 'works.biokea.ai',
    tagline: 'Identity, projects, and permissions — one account across the whole suite.',
    capabilities: [
      'One login and one identity across Atlas, Studio, BioInfoOS, Scribe, and Press',
      'Project creation and permissions management',
      "The passport that carries a researcher's access between every product",
    ],
  },
  {
    slug: 'atlas',
    name: 'Atlas',
    subdomain: 'atlas.biokea.ai',
    tagline: 'Discover, filter, and explore published scientific datasets.',
    capabilities: [
      'Public dashboards and data catalog',
      'Turn what you see into your own reproducible dataset inside Studio, citation trail included',
      'Every published result becomes discoverable here',
    ],
  },
  {
    slug: 'studio',
    name: 'Studio',
    subdomain: 'studio.biokea.ai',
    tagline:
      'The scientific workbench — import data, manage samples, run analyses, review results.',
    capabilities: [
      'Import data and track physical/field samples',
      'Plan and submit analyses that run on BioInfoOS',
      'Explore results: taxonomy, phylogenetic trees, diversity statistics, maps',
      'Hands finished results to Scribe for writing up',
    ],
  },
  {
    slug: 'bioinfoos',
    name: 'BioInfoOS',
    subdomain: 'bioinfoos.biokea.ai',
    tagline: 'The shared compute engine that runs vetted bioinformatics workflows.',
    capabilities: [
      'A curated library of vetted, reproducible bioinformatics tools — never arbitrary code',
      'Every run produces a Result Manifest: a verifiable record of what ran, on what data, with what parameters',
      'Approved users can run analyses directly, through its own interface or a personal API',
    ],
  },
  {
    slug: 'scribe',
    name: 'Scribe',
    subdomain: 'scribe.biokea.ai',
    tagline:
      'Scientific authoring — turn a result into a structured manuscript or interactive StoryMap.',
    capabilities: [
      'Narrative, figures, tables, and citations traceably linked back to source data',
      'StoryMaps — interactive, data-driven scientific narratives combining maps, charts, and text',
      'Documents can start from a Studio result, blank, or an imported manuscript',
    ],
  },
  {
    slug: 'press',
    name: 'Press',
    subdomain: 'press.biokea.ai',
    tagline: 'Peer review and publication — submission through public release.',
    capabilities: [
      'Submission, automated screening, independent human peer review, and editorial decision',
      'Agentis: an evidence-backed review capability linking review claims to their supporting evidence',
      'Public release with permanent archiving (DOI/repository deposit); corrections and retractions preserved as history, never quietly edited away',
    ],
  },
];

export interface ReservedProduct {
  slug: string;
  name: string;
}

export const worksReserved: ReservedProduct[] = [
  { slug: 'droplet', name: 'Droplet' },
  { slug: 'sequoia', name: 'Sequoia' },
];
