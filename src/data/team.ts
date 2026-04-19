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
    role: 'CEO / CTO, Founder',
    image: '/assets/images/portrait-sean.webp',
    alt: 'Headshot of Sean Jungbluth',
  },
  {
    name: 'Michelle Jungbluth',
    role: 'Advisor and Head of Science and Operations',
    image: '/assets/images/portrait-michelle.webp',
    alt: 'Headshot of Michelle Jungbluth',
  },
  {
    name: 'Austin Baker',
    role: 'Biodiversity Research Scientist',
    image: '/assets/images/portrait-austin.webp',
    alt: 'Headshot of Austin Baker',
  },
];
