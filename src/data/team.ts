// src/data/team.ts
export interface TeamMember {
  name: string;
  role: string;
  image: string;
  alt: string;
  bio?: string;
}

export const team: TeamMember[] = [
  {
    name: 'Sean Jungbluth',
    role: 'CEO / CTO',
    image: '/assets/images/profile-sean.png',
    alt: 'Painterly portrait of Sean Jungbluth',
  },
  {
    name: 'Michelle Jungbluth',
    role: 'Head of Science and Operations',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait when ready
    alt: 'Portrait of Michelle Jungbluth',
  },
  {
    name: 'Austin Baker',
    role: 'Biodiversity Research Scientist',
    image: '/assets/images/portrait-placeholder.svg', // VERIFY: replace with real portrait when ready
    alt: 'Portrait of Austin Baker',
  },
];
