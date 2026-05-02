// src/data/games.ts
// The six BioKEA "games" featured in the Golden Sample Hunt
// (Code with Claude · 2026). Each game is a self-contained Vite/React
// app served as static assets under public/games/<slug>/.
//
// Taglines are first-draft; Sean to redline.

export interface Game {
  slug: string;
  title: string;
  tagline: string;
  thumb: string;
  playUrl: string;
}

export const games: Game[] = [
  {
    slug: 'codon2048',
    title: 'Codon Collider',
    tagline: 'A daily DNA-merge puzzle. Build life from a single base to a complete ecosystem.',
    thumb: '/assets/games/codon2048-thumb.png',
    playUrl: '/games/codon2048/',
  },
  {
    slug: 'pipette-rush',
    title: 'Pipette Rush',
    tagline: 'Run the eDNA pipeline as fast as the lab can throw it at you.',
    thumb: '/assets/games/pipette-rush-thumb.png',
    playUrl: '/games/pipette-rush/',
  },
  {
    slug: 'plasmid-plinko',
    title: 'Plasmid Plinko',
    tagline: 'Drop a primer. Clear every gene-peg on the board. Stack lab upgrades between rounds.',
    thumb: '/assets/games/plasmid-plinko-thumb.png',
    playUrl: '/games/plasmid-plinko/',
  },
  {
    slug: 'particle-survival-shooter',
    title: 'Particle Accelerator',
    tagline: 'You are the sample. Survive eight minutes through the contaminant field.',
    thumb: '/assets/games/particle-survival-shooter-thumb.png',
    playUrl: '/games/particle-survival-shooter/',
  },
  {
    slug: 'cal-field-lab-collectible',
    title: 'Biodiversity Discovery Lab',
    tagline: "California's biodiversity survey, rendered as a collectible card-album challenge.",
    thumb: '/assets/games/cal-field-lab-collectible-thumb.png',
    playUrl: '/games/cal-field-lab-collectible/',
  },
  {
    slug: '3d-biodiversity-collect-em-all',
    title: 'WildCal',
    tagline: 'Creatures of California. Explore · Discover · Collect.',
    thumb: '/assets/games/3d-biodiversity-collect-em-all-thumb.png',
    playUrl: '/games/3d-biodiversity-collect-em-all/',
  },
];
