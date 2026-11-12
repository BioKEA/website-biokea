// One-off export for the /sample-report page. Run on Sean's machine with both
// data drives mounted: `npm run sample-report:export`.
// Reads raw plate data and photos (read-only), applies the clean-highlights
// transform, and writes display-only JSON plus resized WebP images.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { latestSizes, toBarcodedWell, toHiresWell } from './transform.mjs';

const BARCODING = '/Volumes/28TB_A/Projects/ONT-Insect-Barcoding';
const IMAGES = '/Volumes/28TB_B/BugPicker-Image-Pipeline/Plate_insect_images';
const OUT_DATA = 'src/data/sample-report';
const OUT_IMG = 'public/assets/sample-report';

for (const vol of ['/Volumes/28TB_A', '/Volumes/28TB_B']) {
  if (!existsSync(vol)) {
    console.error(`${vol} is not mounted. Mount both data drives and re-run.`);
    process.exit(1);
  }
}

const WELLS = [...'ABCDEFGH'].flatMap((r) => Array.from({ length: 12 }, (_, i) => `${r}${i + 1}`));

const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

async function thumb(src, dest, squareFromWide) {
  let img = sharp(src);
  if (squareFromWide) {
    const { width, height } = await img.metadata();
    const side = Math.min(width, height);
    img = img.extract({
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side,
    });
  }
  await img.resize(160, 160, { fit: 'cover' }).webp({ quality: 70 }).toFile(dest);
}

const large = (src, dest, width = 1000) =>
  sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest);

async function exportPlate(id, wells, photoFor, squareFromWide) {
  const dir = join(OUT_IMG, id);
  mkdirSync(dir, { recursive: true });
  const kept = [];
  for (const w of wells) {
    const src = photoFor(w.well);
    if (!existsSync(src)) continue;
    await thumb(src, join(dir, `t-${w.well}.webp`), squareFromWide);
    await large(src, join(dir, `l-${w.well}.webp`));
    kept.push(w);
  }
  writeJson(join(OUT_DATA, `${id}.json`), kept);
  console.log(`${id}: ${kept.length} wells`);
}

mkdirSync(OUT_DATA, { recursive: true });

// AA0022: photographed + barcoded.
const rows = JSON.parse(
  readFileSync(join(BARCODING, 'runs/AA0003-AA0024/demo/aa0022_wells.json'), 'utf8'),
);
const byWell = new Map(rows.map((r) => [r.well, r]));
const aa0022 = WELLS.map((w) => byWell.get(w))
  .filter(Boolean)
  .map(toBarcodedWell)
  .filter(Boolean);
await exportPlate(
  'aa0022',
  aa0022,
  (w) => join(IMAGES, 'P-AA0022', `IMG-DNA-AA0022-${w}_well.png`),
  true,
);

// AA0055: high-res, awaiting barcodes.
const attempts = readFileSync(join(IMAGES, 'P-AA0055/plate_attempts.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const sizes = latestSizes(attempts);
const hiresPath = (w) => join(IMAGES, 'P-AA0055', `IMG-DNA-AA0055-${w}_hires.png`);
await exportPlate(
  'aa0055',
  WELLS.map((w) => toHiresWell(w, sizes)),
  hiresPath,
  false,
);

await large(hiresPath('C5'), join(OUT_IMG, 'banner.webp'), 1600);
console.log('banner: AA0055 C5');
