# "What you get back" sample report page — design

Date: 2026-11-12 · Status: draft for Sean's review (builder check done)

## Why

BioKEA is a young lab, and first-time buyers can't easily tell whether it is
real and experienced, or what they will get back for their money. Sean picked
this ("customers not trusting BioKEA enough to order") as the first problem to
solve after looking at wilderlab.co, which answers both questions before
anyone orders.

BioKEA already has the proof: plates of insects picked by BugPicker,
photographed in every well, and DNA-barcoded for the California Institute for
Biodiversity (CIB). This page shows that real work and sends the visitor
straight to the quote builder.

**Success:** a prospective customer sees the page, believes BioKEA can do the
work, and clicks **Build a quote** to order sequencing.

## Goals

1. A new page on biokea.ai showing what a customer gets back, built around an
   interactive 96-well plate of real specimen photos and IDs.
2. Two plates, switchable by tabs:
   - **AA0022, "photographed + barcoded"**: the sequenced plate, with species
     or genus per well.
   - **AA0055, "new high-res microscope"**: a plate from the newer, higher-power
     microscope, with large sharp photos. Its barcodes are not back yet; AA0055
     is in the next sequencing run (Sean, 2026-11-12). The high-res images must
     be featured even before sequences exist.
3. A clear path to **Build a quote** (`/quote`), plus a pointer to new datasets
   published on calatbi.biokea.ai.

## Non-goals

- The "will the process go smoothly?" material (sampling instructions, shipping,
  metadata, receiving results, as on wilderlab.co). Separate piece of work, later.
- A public data portal, map, or API like Wilderlab's. calatbi.biokea.ai is where
  datasets live; this page links there.
- Showing every plate. Two plates only.

## Anti-goals

- **Clean highlights only (Sean's decision).** The page must not show
  contamination, the contaminated blank wells, sample swaps, non-target hits
  (e.g. _Wolbachia_), candidate new species, or "second organism" flags. The
  existing plate "tour guides" feature some of these, so they cannot be linked
  or reused as-is.
- Publishing a number that isn't true. Every stat on the page is one Sean
  confirmed or one the run reports support.
- A slow page. ~190 images per plate must not make it heavy to load.

## The page (as agreed on the mockups)

Mockups: `.superpowers/brainstorm/45936-1794498510/content/layout-v3.html`
(served by the visual companion; Sean chose layout A with B's banner, then the
two-plate version).

Top to bottom:

1. **Banner.** A high-res insect photo (from AA0055), darkened, with:
   - eyebrow: "WHAT YOU GET BACK · INSECT DNA BARCODING"
   - headline: "Every insect. Photographed. Named."
   - one line: real plates from our work for the California Institute for
     Biodiversity, picked by BugPicker, imaged, and DNA-barcoded.
2. **Plate tabs.** "Plate AA0022 · photographed + barcoded" and "Plate AA0055 ·
   new high-res microscope", with a one-line caption under each:
   - AA0022: "95 insects, each photographed in its well and named from its DNA
     barcode."
   - AA0055: "Our newer microscope photographs each insect at higher
     magnification before it is picked. This plate is sequencing now; its
     barcodes will appear here and on calatbi.biokea.ai."
3. **Plate explorer.** An 8 × 12 grid (rows A–H, columns 1–12) of circular well
   thumbnails using the real photos. H12 is the blank control and shows as an
   empty well with no label. Clicking a well selects it (highlight ring) and
   updates a card beside the grid:
   - large photo of that specimen
   - "WELL <id> · <status>"
   - **AA0022:** named to species → common name if we have one, else family, plus
     the italic species name, reads, and % match. Named to genus → family plus
     "_Genus_ sp.", and reads. Anything else → just the insect order recorded
     at picking, with no further detail (the clean-highlights rule; my call on
     how to apply it).
   - **AA0055:** "HIGH-RES IMAGE · BARCODE IN THE QUEUE", and the specimen size
     BugPicker measured when picking (e.g. "7.0 × 5.9 mm as picked").
   - Ring colour on each well shows status: species, genus, other; AA0055 wells
     all share one "awaiting barcode" colour.
4. **Stats band**: 30+ 96-well plates sequenced; 70 plates picked by
   BugPicker; 98% median barcode agreement; CIB as anchor partner. Sean
   confirmed 30+ and 70 on 2026-11-12; the data behind them is not all on
   the drives searched.
5. **Build a quote** button (primary) to `/quote`, and a link "New datasets
   on calatbi.biokea.ai". No downloads for now (Sean, 2026-11-12).

Downloads (a cleaned example report, or a filtered species table and FASTA)
are a later addition; the existing tour guides and wet-lab summaries contain
flagged material and must not be linked.

Below the fold, the builder may add a short "Every order includes" list (photo
of every specimen, a COI barcode per well, a species table with match scores,
a plate report, optional publication to calatbi.biokea.ai), from mockup C,
if it fits the site's voice.

## Data sources (read-only; these are on Sean's local drives)

- **AA0022 IDs:** `/Volumes/28TB_A/Projects/ONT-Insect-Barcoding/runs/AA0003-AA0024/demo/aa0022_wells.json`:
  96 rows with `well`, `cat` (`species`, `genus`, `cand_hi`, `cand_lo`,
  `coarse`, `nontarget`, `control`), `order_recorded`, `bold_order`, `family`,
  `genus`, `species`, `reads`, `ident`, `gb_pid`, `extract`, `collection`
  (CIBI number). Plate AA0022 has 37 wells named to species and 48 to genus.
  Common names exist only for a handful (in the tour guide); others fall back
  to family.
- **AA0022 photos:** `/Volumes/28TB_B/BugPicker-Image-Pipeline/Plate_insect_images/P-AA0022/`:
  per well `IMG-DNA-AA0022-<well>_well.png` (1920×1080, the photo used),
  `_bottom.png`, `_scan.png` (small).
- **AA0055 photos:** `.../P-AA0055/IMG-DNA-AA0055-<well>_hires.png` (1280×720).
  High-res exists for plates AA0029–AA0070.
- **AA0055 sizes:** `.../P-AA0055/plate_attempts.jsonl`, one line per pick
  attempt with `well`, `scan_bbox_width_mm`, `scan_bbox_height_mm`; use the last
  attempt per well.
- Run reports with the 98.2% median agreement figure:
  `/Volumes/28TB_A/Projects/ONT-Insect-Barcoding/REPORT.md` and
  `runs/AA0003-AA0024/REPORT.md`.

The site cannot read those drives at runtime. The builder exports a static,
committed data file per plate (well → display fields only, already filtered
to clean highlights) and resized web images into the repo. No raw run data,
read files, or flagged detail goes into the repo.

## Calls made after the builder check (mine)

- **Which wells show.** Every one of the 95 specimen photos appears in the
  grid, so "95 insects" stays true. On AA0022, 85 wells carry a name (37
  species, 48 genus). The other 10 (`cand_hi` 5, `cand_lo` 2, `coarse` 2,
  `nontarget` 1) show the photo with only the recorded order. The control
  (H12) is an empty well. AA0022 has no recorded swap (the documented swap
  was on AA0002), so no exclusion list is needed.
- **Common names.** Write them by hand only for species-level wells,
  starting from the tour-guide headings for those wells (sweat bee, minute
  pirate bug, predatory plant bug used in biocontrol, spider-riding wasp,
  western subterranean termite, leafminer fly). Never copy text about
  flagged wells. Everything else falls back to family. The Latin name
  always shows.
- **AA0055 sizes.** `plate_attempts.jsonl` has 141 attempts over 95 wells
  (up to 4 per well). Use the latest by `logged_at`. If a well has no size,
  omit the size line.
- **Image hosting.** Commit resized images as static assets under
  `public/assets/` (Workers static assets), produced by a one-off export
  script run on Sean's machine. No R2 bucket and no Worker route. The site's
  public assets are 59 MB today; this adds a few MB.
- **98% figure.** Both runs support it: run 1 median 98.2%, run 2 median
  98.0%.

## Images

- Resize and compress: a small thumbnail per well for the grid, and one larger
  image per well for the card (modern format; ~1000 px wide is enough for the
  card and the banner). Roughly 380 images across both plates.
- Load the large image only when its well is selected. The page must stay light
  on first load.
- The builder picks the banner photo from AA0055.

## Where it fits in the site

- URL: `/sample-report` was used in the mockup; the builder may choose a
  better slug.
- Link it from the services page, the pricing page, and the homepage, and add
  it to the nav. Placement is the builder's call within the existing nav
  structure (`src/components/layout/Nav.astro`).
- Same tech and look as the rest of the site (Astro, existing components and
  colours), including page JSON-LD and an `llms.txt` mention like other pages.

## When AA0055 is sequenced

The AA0055 tab becomes a photographed-and-barcoded plate like AA0022, with the
same clean-highlights filter. The data shape should make that a data-file
swap, not a redesign.

## Also fix (found during research)

`/services` still says sequencing runs on the ONT Promethion 2 only (no MiSeq
i100) and gives a 4–8 week turnaround. Update the instrument line; flag the
turnaround to Sean rather than changing it.

## Open (Sean to confirm before launch)

- Whether CIB is fine being named on the page with its plates shown (the plates
  were prepared for CIB; the site already names CIB as a partner).

## Left to the builder

- Exact copy beyond what is quoted above, in the site's voice.
- Page slug, nav placement, and link wording from other pages.
- Ring colours and the card layout details, within the mockup.
- Whether to include the "Every order includes" list.
- Mobile layout (the grid must stay usable at phone width).
