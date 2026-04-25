// src/data/team.ts
export type TeamTier = 'team' | 'advisor';

export interface TeamMember {
  name: string;
  role: string;
  image: string;
  alt: string;
  bio?: string;
  tier?: TeamTier;
  postNominal?: string;
}

export const team: TeamMember[] = [
  {
    name: 'Sean Jungbluth',
    role: 'CEO / CTO, Founder',
    postNominal: 'PhD',
    image: '/assets/images/portrait-sean.webp',
    alt: 'Headshot of Sean Jungbluth',
    tier: 'team',
    bio: 'Microbial genomicist building computational and AI tooling for environmental biology. Lectures sometimes at Stanford on microbial genomics; previously studied deep-sea and subsurface microbial diversity across three submersible expeditions to ~2,650 m. Author of open-source pipelines and a contributor to FAIR data standards (MIxS, MIEM).',
  },
  {
    name: 'Michelle Jungbluth',
    role: 'CSO, Co-Founder',
    postNominal: 'PhD',
    image: '/assets/images/portrait-michelle.webp',
    alt: 'Headshot of Michelle Jungbluth',
    tier: 'team',
    bio: "Marine and estuarine ecologist focused on zooplankton communities and food-web dynamics. Combines field sampling with DNA barcoding, eDNA, qPCR, and metabarcoding to track threatened estuarine fishes — including longfin smelt — and identify indicator species in human-impacted wetlands. Lead investigator on BioKEA's San Francisco Bay metabarcoding baseline.",
  },
  {
    name: 'Austin Baker',
    role: 'Founding Research Scientist',
    postNominal: 'PhD',
    image: '/assets/images/portrait-austin.webp',
    alt: 'Headshot of Austin Baker',
    tier: 'team',
    bio: "Entomologist and biodiversity scientist leading the California Insect Barcoding Initiative — over 1 million specimens barcoded, with recent work estimating that at least one third of the state's insect biodiversity remains undiscovered. Previously a postdoctoral scholar at the Natural History Museum of Los Angeles County. PhD on parasitoid-wasp systematics.",
  },
  {
    name: 'Sunit Jain',
    role: 'Advisor',
    postNominal: 'MS',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait
    alt: 'Placeholder portrait of Sunit Jain',
    tier: 'advisor',
    bio: 'Bioinformatics scientist with 13+ years building agentic, multi-agent systems for microbial-community analysis. Author of Colloquip.',
  },
  {
    name: 'Greg Fedewa',
    role: 'Advisor',
    postNominal: 'PhD',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait
    alt: 'Placeholder portrait of Greg Fedewa',
    tier: 'advisor',
    bio: 'Bioinformatics scientist (Caltech, Centre for Pathogen Evolution) developing computational methods for immunological and antigenic data analysis.',
  },
];
