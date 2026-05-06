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
  | 'count' // pipette-rush — N successful daily runs
  | 'milestone' // long-form — server-tracked progress counter
  | 'plasmid-ante' // plasmid-plinko — antesCleared >= N in metadata
  | 'codon-tier' // codon2048 — highestTier >= N in metadata
  | 'particle-time'; // particle — score (= seconds survived) >= N

export interface SlotConfig {
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  game: string;
  // Order in the assembled sentence:
  //   "Every Human Now Has Scientific Superpowers"
  //    1     2     3   4   5         6
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
    kind: 'count',
    threshold: 12,
    hint: 'Complete 12 daily runs in Pipette Rush.',
  },
  {
    slot: 2,
    game: '3d-biodiversity-collect-em-all',
    kind: 'milestone',
    threshold: 20,
    hint: 'Encounter 20 different animals in WildCal.',
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
    kind: 'plasmid-ante',
    threshold: 3,
    hint: 'Reach level 3 in Plasmid Plinko daily mode.',
  },
  {
    slot: 5,
    game: 'codon2048',
    // Ecosystem tier id (see /tmp/games-audit/codon2048/src/lib/tiers.ts).
    kind: 'codon-tier',
    threshold: 11,
    hint: 'Reach the Ecosystem tier in Codon Collider daily mode.',
  },
  {
    slot: 6,
    game: 'particle-survival-shooter',
    // 6 minutes survived = 360 seconds.
    kind: 'particle-time',
    threshold: 360,
    hint: 'Survive 6 minutes in Particle Accelerator.',
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
// Opens one day earlier than the official launch so the team can test
// end-to-end (claim → state → redeem) before the public hero copy
// drops on 2026-05-07.
export const CAMPAIGN_OPENS_ISO = '2026-05-06T00:00:00Z';
export const CAMPAIGN_CLOSES_ISO = '2026-07-06T23:59:59Z';

// Maximum prizes awarded across the campaign. The 11th completer sees
// "hunt closed — sentence revealed, prizes redeemed" instead of an
// address form.
export const PRIZE_CAP = 10;

export function isCampaignOpen(now = new Date()): boolean {
  const t = now.getTime();
  return t >= Date.parse(CAMPAIGN_OPENS_ISO) && t <= Date.parse(CAMPAIGN_CLOSES_ISO);
}

// Display constants used in copy. Kept here so site + emails agree.
export const SENTENCE = 'Every Human Now Has Scientific Superpowers';
export const HUNT_NAME = 'Golden Sample 26';
