// src/data/games.ts
// The six BioKEA "games" — browser games built around what the lab
// actually does. Each game is a self-contained Vite/React
// app served as static assets under public/mission/games/<slug>/, so the
// public URL is /mission/games/<slug>/ — nested under the Mission section
// to reinforce the storytelling thesis.
//
// Taglines are first-draft; Sean to redline.

export interface Game {
  slug: string;
  title: string;
  tagline: string;
  thumb: string;
  playUrl: string;
  // GitHub repo in `owner/name` form. When set, CI clones + rebuilds the
  // game from this repo on each deploy (see scripts/build-games.mjs);
  // when unset, the pre-bundled artifact under public/mission/games/<slug>/
  // ships.
  repo?: string;
}

export const games: Game[] = [
  {
    slug: 'codon2048',
    title: 'Codon Collider',
    tagline: 'A daily DNA-merge puzzle. Build life from a single base to a complete ecosystem.',
    thumb: '/assets/games/codon2048-thumb.png',
    playUrl: '/mission/games/codon2048/',
    repo: 'BioKEA/game-codon2048',
  },
  {
    slug: 'pipette-rush',
    title: 'Pipette Rush',
    tagline: 'Run the eDNA pipeline as fast as the lab can throw it at you.',
    thumb: '/assets/games/pipette-rush-thumb.png',
    playUrl: '/mission/games/pipette-rush/',
    repo: 'BioKEA/game-pipette-rush',
  },
  {
    slug: 'plasmid-plinko',
    title: 'Plasmid Plinko',
    tagline: 'Drop a primer. Clear every gene-peg on the board. Stack lab upgrades between rounds.',
    thumb: '/assets/games/plasmid-plinko-thumb.png',
    playUrl: '/mission/games/plasmid-plinko/',
    repo: 'BioKEA/game-plasmid-plinko',
  },
  {
    slug: 'particle-survival-shooter',
    title: 'Particle Accelerator',
    tagline: 'You are the sample. Survive eight minutes through the contaminant field.',
    thumb: '/assets/games/particle-survival-shooter-thumb.png',
    playUrl: '/mission/games/particle-survival-shooter/',
    repo: 'BioKEA/game-particle-survival-shooter',
  },
  {
    slug: 'cal-field-lab-collectible',
    title: 'Biodiversity Discovery Lab',
    tagline: "California's biodiversity survey, rendered as a collectible card-album challenge.",
    thumb: '/assets/games/cal-field-lab-collectible-thumb.png',
    playUrl: '/mission/games/cal-field-lab-collectible/',
    repo: 'BioKEA/game-cal-field-lab-collectible',
  },
  {
    slug: '3d-biodiversity-collect-em-all',
    title: 'WildCal',
    tagline: 'Creatures of California. Explore · Discover · Collect.',
    thumb: '/assets/games/3d-biodiversity-collect-em-all-thumb.png',
    playUrl: '/mission/games/3d-biodiversity-collect-em-all/',
    repo: 'BioKEA/game-3d-biodiversity-collect-em-all',
  },
];
