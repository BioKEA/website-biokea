// src/lib/golden-sample/config.ts
//
// Public hunt config — slot↔game mapping, unlock thresholds, campaign
// window, prize cap. The actual *words* are NOT here. They live only
// as a Worker secret (`GOLDEN_WORDS` JSON map) on Cloudflare. Source
// readers + LLM-assisted source readers see the conditions but never
// the payload.
//
// I won't tell. That would be cheating.

export type SlotKind =
  | 'milestone' // long-form — server-tracked progress counter
  | 'plasmid-ante' // plasmid-plinko — antesCleared >= N in metadata
  | 'codon-tier' // codon2048 — highestTier >= N in metadata
  | 'particle-time' // particle — score (= seconds survived) >= N
  | 'pipette-wave'; // pipette-rush — any run with metadata.wave >= N

export interface SlotConfig {
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  game: string;
  // The slot index is the position in the hidden sentence, but the
  // sentence itself is intentionally NOT in this file. It's assembled
  // server-side from the GOLDEN_WORDS Cloudflare Worker secret only
  // when the player has earned all six slots and submits valid
  // tokens to /api/golden-sample/redeem.
  kind: SlotKind;
  threshold: number;
  // Human-readable unlock description for the collection wall.
  hint: string;
}

// SLOT 1..6 in sentence order. The slot is the canonical position;
// the game→slot binding is fixed for the campaign.
export const SLOTS: readonly SlotConfig[] = [
  {
    slot: 1,
    game: 'pipette-rush',
    // Single-run waves cleared. Stored as metadata.wave on each
    // pipette-rush daily score row. Mirror change in pipette-rush's
    // lib/golden-sample.ts:SLOT_THRESHOLD_WAVE so the in-run gate
    // matches.
    kind: 'pipette-wave',
    threshold: 12,
    hint: 'Reach wave 12 in a single Pipette Rush daily run.',
  },
  {
    slot: 2,
    game: '3d-biodiversity-collect-em-all',
    kind: 'milestone',
    threshold: 20,
    // Encounter (= seen in the BayDex), not capture. Capture would
    // require battle + catch, which is a much steeper grind; we want
    // exploration to be the unlock.
    hint: 'Encounter 20 different creatures in WildCal.',
  },
  {
    slot: 3,
    game: 'cal-field-lab-collectible',
    kind: 'milestone',
    threshold: 5,
    hint: 'Process 5 specimens in Biodiversity Discovery Lab.',
  },
  {
    slot: 4,
    game: 'plasmid-plinko',
    // Plasmid daily-mode level (antesCleared) the player has to reach
    // in a single run. Mirror change in plasmid-plinko's
    // src/lib/golden-sample.ts:SLOT_THRESHOLD_ANTES so the in-run gate
    // matches.
    kind: 'plasmid-ante',
    threshold: 8,
    hint: 'Reach level 8 in Plasmid Plinko daily mode.',
  },
  {
    slot: 5,
    game: 'codon2048',
    // Population tier id (see codon2048/src/lib/tiers.ts). Lowered
    // from Ecosystem (11) to Population (10) — Species → Ecosystem is
    // a brutally hard last-stretch and was gating the hunt for almost
    // every player. Population still requires a genuinely strong run.
    kind: 'codon-tier',
    threshold: 10,
    hint: 'Reach the Population tier in Codon Collider daily mode.',
  },
  {
    slot: 6,
    game: 'particle-survival-shooter',
    // Survive the full game. RUN_DURATION in particle is 480 seconds
    // (8 minutes); reaching that = the run completed without dying.
    // Earlier draft thresholds (300/360) handed the slot out for
    // partial survival, which felt too lenient given this is the last
    // word in the sentence.
    kind: 'particle-time',
    threshold: 480,
    hint: 'Survive the entire 8-minute run in Particle Accelerator.',
  },
] as const;

// Lookup helpers.
export const SLOT_BY_GAME = new Map<string, SlotConfig>(SLOTS.map((s) => [s.game, s]));

export function slotForGame(gameId: string): SlotConfig | undefined {
  return SLOT_BY_GAME.get(gameId);
}

// Campaign window — tickets issued outside this range still trigger
// the in-game animation (the player earned it; deny that and they'll
// hate us) but won't count toward the prize on /golden-sample-26.
// Public launch day is 2026-05-07 (today). The pre-launch test window
// closed at 2026-05-06; opens for the public at 2026-05-07T00:00:00Z.
export const CAMPAIGN_OPENS_ISO = '2026-05-07T00:00:00Z';
export const CAMPAIGN_CLOSES_ISO = '2026-07-07T23:59:59Z';

// Maximum prizes awarded across the campaign. The 11th completer sees
// "hunt closed — sentence revealed, prizes redeemed" instead of an
// address form.
export const PRIZE_CAP = 10;

export function isCampaignOpen(now = new Date()): boolean {
  const t = now.getTime();
  return t >= Date.parse(CAMPAIGN_OPENS_ISO) && t <= Date.parse(CAMPAIGN_CLOSES_ISO);
}

// Public hunt name — safe in source. The sentence is server-only;
// the redemption API assembles it from GOLDEN_WORDS at the moment a
// player redeems all six valid tokens, never on the client.
export const HUNT_NAME = 'Golden Sample 26';
