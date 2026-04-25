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
  },
  {
    name: 'Michelle Jungbluth',
    role: 'CSO, Co-Founder',
    postNominal: 'PhD',
    image: '/assets/images/portrait-michelle.webp',
    alt: 'Headshot of Michelle Jungbluth',
    tier: 'team',
  },
  {
    name: 'Austin Baker',
    role: 'Founding Research Scientist',
    postNominal: 'PhD',
    image: '/assets/images/portrait-austin.webp',
    alt: 'Headshot of Austin Baker',
    tier: 'team',
  },
  {
    name: 'Sunit Jain',
    role: 'Advisor',
    postNominal: 'MS',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait
    alt: 'Placeholder portrait of Sunit Jain',
    tier: 'advisor',
  },
  {
    name: 'Greg Fedewa',
    role: 'Advisor',
    postNominal: 'PhD',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait
    alt: 'Placeholder portrait of Greg Fedewa',
    tier: 'advisor',
  },
];
