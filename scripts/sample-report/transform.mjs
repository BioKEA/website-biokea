// Clean-highlights transform for the /sample-report page.
// Pure functions, no I/O: turn raw plate rows into display-only fields.
// Flagged categories (candidates, non-target hits, coarse IDs) keep only the
// insect order recorded at picking; the blank control is dropped.

/**
 * @typedef {{ well: string; status: 'species' | 'genus' | 'order' | 'awaiting';
 *   label: string; name?: string; reads?: number; match?: number; size?: string }} DisplayWell
 */

/** Hand-written common names, keyed by species. */
export const COMMON_NAMES = {
  'Lasioglossum hyalinum': 'A sweat bee',
  'Orius tristicolor': 'Minute pirate bug',
  'Dicyphus hesperus': 'A predatory plant bug used in biocontrol',
  'Liriomyza septentrionalis': 'A leafminer fly',
  'Acrodactyla quadrisculpta': 'A wasp that rides on spiders',
  'Reticulitermes hesperus': 'Western subterranean termite',
};

/**
 * @param {Record<string, any>} raw one row of aa00xx_wells.json
 * @returns {DisplayWell | null}
 */
export function toBarcodedWell(raw) {
  const { well, cat } = raw;
  if (cat === 'control') return null;
  if (cat === 'species') {
    // gb_pid is identity to the nearest GenBank record, which can be another
    // taxon; only show it as "% match" when that record is the named species.
    const sameTaxon = String(raw.gb ?? '').startsWith(`${raw.species} `);
    return {
      well,
      status: 'species',
      label: COMMON_NAMES[raw.species] ?? raw.family,
      name: raw.species,
      reads: raw.reads,
      ...(sameTaxon ? { match: Math.round(Number(raw.gb_pid) * 10) / 10 } : {}),
    };
  }
  if (cat === 'genus') {
    return {
      well,
      status: 'genus',
      label: raw.family || raw.bold_order,
      name: `${raw.genus} sp.`,
      reads: raw.reads,
    };
  }
  return { well, status: 'order', label: raw.order_recorded || 'Insect' };
}

/**
 * Size per well from the latest pick attempt that found the well occupied.
 * @param {Record<string, any>[]} lines parsed plate_attempts.jsonl rows
 * @returns {Map<string, string>}
 */
export function latestSizes(lines) {
  /** @type {Map<string, Record<string, any>>} */
  const latest = new Map();
  for (const a of lines) {
    if (!String(a.confirmation ?? '').includes('occupied')) continue;
    if (typeof a.scan_bbox_width_mm !== 'number' || typeof a.scan_bbox_height_mm !== 'number')
      continue;
    const prev = latest.get(a.well);
    if (!prev || String(a.logged_at) > String(prev.logged_at)) latest.set(a.well, a);
  }
  const sizes = new Map();
  for (const [well, a] of latest)
    sizes.set(
      well,
      `${a.scan_bbox_width_mm.toFixed(1)} × ${a.scan_bbox_height_mm.toFixed(1)} mm as picked`,
    );
  return sizes;
}

/**
 * Wells that BugPicker confirmed it picked an insect into. A well whose every
 * attempt came back empty may hold nothing, so it is not shown as queued.
 * @param {Record<string, any>[]} lines parsed plate_attempts.jsonl rows
 * @returns {Set<string>}
 */
export function occupiedWells(lines) {
  return new Set(
    lines.filter((a) => String(a.confirmation ?? '').includes('occupied')).map((a) => a.well),
  );
}

/**
 * @param {string} well
 * @param {Map<string, string>} sizes
 * @returns {DisplayWell}
 */
export function toHiresWell(well, sizes) {
  const size = sizes.get(well);
  return { well, status: 'awaiting', label: `Specimen ${well}`, ...(size ? { size } : {}) };
}
