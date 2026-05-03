// Games that submit to the shared leaderboard, with their canonical
// "ranked mode" (the mode whose seed is a date and whose scores count
// toward BKP). Mirrors the `ranked_modes` lookup in migration 0003.
//
// Adding a new game means: (1) insert a row in ranked_modes, (2) add
// an entry here, (3) add the slug to LEADERBOARD_ENABLED in
// scripts/build-games.mjs so the build passes real Supabase env.

export interface LeaderboardGame {
  id: string;
  title: string;
  mode: string;
  // 'pts'  — formatted with thousands separator
  // 'sec'  — formatted as MM:SS (used by Particle Accelerator: time survived)
  unit: 'pts' | 'sec';
  playUrl: string;
}

export const LEADERBOARD_GAMES: LeaderboardGame[] = [
  {
    id: 'codon2048',
    title: 'Codon Collider',
    mode: 'classic-daily',
    unit: 'pts',
    playUrl: '/mission/games/codon2048/',
  },
  {
    id: 'pipette-rush',
    title: 'Pipette Rush',
    mode: 'daily',
    unit: 'pts',
    playUrl: '/mission/games/pipette-rush/',
  },
  {
    id: 'plasmid-plinko',
    title: 'Plasmid Plinko',
    mode: 'daily',
    unit: 'pts',
    playUrl: '/mission/games/plasmid-plinko/',
  },
  {
    id: 'particle-survival-shooter',
    title: 'Particle Accelerator',
    mode: 'daily',
    unit: 'sec',
    playUrl: '/mission/games/particle-survival-shooter/',
  },
  {
    id: 'cal-field-lab-collectible',
    title: 'Biodiversity Discovery Lab',
    mode: 'daily',
    unit: 'pts',
    playUrl: '/mission/games/cal-field-lab-collectible/',
  },
  {
    id: '3d-biodiversity-collect-em-all',
    title: 'WildCal',
    mode: 'daily',
    unit: 'pts',
    playUrl: '/mission/games/3d-biodiversity-collect-em-all/',
  },
];

// Per-game localStorage keys where each game stashes the player's handle.
// Used by the leaderboard page to pre-populate the "find me" field. Order
// matters — first match wins, so put the most distinctive games first.
export const KNOWN_HANDLE_KEYS: string[] = [
  'codon-collider:display-name-v1',
  'pipette-rush:handle-v1',
  'plasmid-plinko-handle',
  'pa:handle-v1', // particle-survival-shooter
  'cal-field-lab:handle-v1',
  'wildcal:handle-v1',
];

export const SUPABASE_URL = 'https://xkmfsxcaapyuxachtcsy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HmeteofpCTVchDfmzrMAxg_y0ea1IM1';
