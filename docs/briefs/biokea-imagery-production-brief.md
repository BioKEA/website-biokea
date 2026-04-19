# BioKEA imagery production brief — 13 assets

**Scope:** everything still missing from the biokea.ai visual system, each as a standalone brief ready to paste into Midjourney, DALL·E 3, Stable Diffusion XL / Flux, Ideogram, Recraft, or a photography direction.

**Companion docs:** `docs/briefs/biokea-ldc-style-guide.md` covers the core visual system at depth (palette, line quality, what-to-avoid). This brief recaps the essentials at the top, then drops a full per-asset spec for all 13 images. Read the LDC guide first.

**Why this order:** Tier 1 assets ship first because they are visible everywhere (OG card, favicon) or they anchor a major page (map). Tier 2 deepens the story. Tier 3 is polish. Tier 4 is aspirational.

**Emphasis:** the first three assets get extra depth — ASCII composition sketches, multiple prompt variants per tool, extended failure-mode notes.

---

## How to use this document

1. Pick an asset. Read its `Purpose` + `Delivery spec` + `Composition` sections.
2. Pick a tool (Midjourney / DALL·E 3 / SDXL or Flux / Ideogram for text-heavy / Recraft for vector). Copy the prompt block for that tool.
3. Iterate. The first output is almost never the final.
4. Run the `Common failure modes` checklist against the result.
5. Post-produce per the notes (typeset text, crop, export to the delivery format).
6. Drop the final file into `public/assets/images/` at the **exact filename** in the Delivery spec. Site integration code expects those filenames.

Every asset specifies: filename, dimensions, file format, max KB, transparent-vs-filled background, and alt-text. Don't deviate on filenames — the Astro pages reference them by string.

---

## Shared style system (recap)

Full detail: see `docs/briefs/biokea-ldc-style-guide.md`. Short version:

### Palette (all hex from `src/styles/tokens.css`)

| Role                | Hex                   | Usage                                              |
| ------------------- | --------------------- | -------------------------------------------------- |
| Cream (background)  | `#F3EFE6`             | Default paper                                      |
| Cream warm          | `#F6F2E9`             | Alt sections                                       |
| Ink (high contrast) | `#0b1f1a`             | Wordmark, headlines, dark CTAs                     |
| Slate (body)        | `#475569`             | Body copy                                          |
| Teal (primary)      | `#0f766e`             | Dominant line color                                |
| Teal bright         | `#5eead4`             | Rare highlight                                     |
| Ochre (warm accent) | `#92400e`             | Secondary line work, tick-marks                    |
| Magenta (signal)    | `#be185d`             | **Reserved** — single earned spark per composition |
| Grid lines          | `rgba(30,41,59,0.04)` | Optional blueprint underlay                        |

**Teal is dominant. Ochre is secondary. Magenta is a signal — at most one earned spark per composition.** Never use every palette color at once.

### Line quality (non-negotiables)

- Flat draftsman / blueprint feel. No neon. No glow. No outer halo. No bloom.
- No drop shadows. No 3D rendering unless the asset is explicitly an isometric illustration.
- No heavy gradient fills. If a gradient is unavoidable, keep delta < 20%.
- Crisp technical line weight, as if drawn in an architect's pen or a scientific diagram.
- Paper texture OK at ≤ 3% opacity; anything more reads as noise.

### Reference aesthetic

Your v2026.01 NotebookLM-styled deck (`docs/references/AI_First_Bio_Publishing.pdf`) IS the visual language. Look at slides 1, 4, 5, 10, and 12 before every generation. If the output doesn't feel like it could be a new slide in that deck, it's wrong.

Also usable as live references:

- NotebookLM marketing illustrations
- Linear.app documentation art
- Anthropic blog hero illustrations
- Wikimedia Commons "botanical illustration" / "architectural drawing" categories for line-work inspiration

### Delivery conventions

- **Preferred format:** WebP quality 82–85 for photography-style assets; SVG for geometric illustrations that need to scale; PNG with transparency where WebP isn't supported downstream.
- **Retina policy:** provide the intrinsic pixel size listed in each brief. Unless stated, a 2× variant is unnecessary — the listed size already accounts for 2× display density.
- **Filesize ceilings:** listed per asset. If a generation exceeds, compress with `magick ... -quality 82` or `cwebp -q 82`.
- **Colorspace:** sRGB for everything web. Strip embedded profiles that aren't sRGB.
- **Metadata:** strip EXIF and comments from final deliverables. Use `magick input.webp -strip output.webp` or `exiftool -all= output.webp`.

---

# TIER 1 — ship these first

These are the three highest-leverage missing assets. They ship before anything in Tiers 2-4. Treat them as finished products with multiple review rounds.

---

## 1. Open-graph / social share card ⭐

**Why it matters:** appears every time any biokea.ai URL is linked on Bluesky, Mastodon, LinkedIn, Slack, Discord, Gmail, iMessage, Substack embeds, or any OG-aware platform. The **single most widely-seen piece of BioKEA art** outside the site itself. Currently falls back to `logo2.png` which shows up as a tiny centered mark with cream letterboxing — unreadable and lossy.

**Produce three variants:** one generic (home), one lab-specific (`/lab`), one agentis-specific (`/agentis`). The home variant is the priority — the other two can use the home design with a different right-side wordmark.

### Delivery spec

|                    |                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| Filename (home)    | `public/assets/images/og-home.jpg`                                                     |
| Filename (lab)     | `public/assets/images/og-lab.jpg`                                                      |
| Filename (agentis) | `public/assets/images/og-agentis.jpg`                                                  |
| Dimensions         | **1200 × 630** (OG standard; preview safe area 1200×600)                               |
| Format             | JPEG, quality 85                                                                       |
| Max filesize       | ≤ 200 KB (many platforms compress further)                                             |
| Background         | Solid cream `#F3EFE6` (no transparency — OG parsers drop alpha)                        |
| Colorspace         | sRGB, no embedded profile                                                              |
| Alt text (home)    | "BioKEA — an AI company with a wet-lab moat. Biology, decoded in the public interest." |

### Concept anchors

- **Left half: the LDC illustration** (recolored version from `BioKEA-Large-Data-Collider.webp`) at 500–550px wide, vertically centered.
- **Right half: text block.**
  - Line 1 (small mono eyebrow): `BIOKEA · BERKELEY, CA`
  - Line 2 (display hero): **Biology, decoded in the public interest.** — on three lines max
  - Line 3 (mono tagline): `biokea.ai`
- **Bottom-right corner** (subtle): the mascot-only portion of the BioKEA logo, maybe 60px tall, teal line.
- **Subtle blueprint grid** at 3–5% opacity slate lines across the whole card.
- **No drop shadows.** Flat on cream.

### ASCII composition sketch

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                      BIOKEA · BERKELEY, CA       │
│    ╭──────╮                                      │
│    │  ⊙   │     Biology,                         │
│    │ DNA  │     decoded in the                   │
│    │ ring │     public interest.                 │
│    │ LDC  │                                      │
│    ╰──────╯     biokea.ai                        │
│                                                  │
│                                          ⌬ mark  │
└──────────────────────────────────────────────────┘
  1200 × 630,  cream #F3EFE6 ground, blueprint grid
```

### Palette usage

- Ground: cream `#F3EFE6`
- LDC illustration: already cream-native (teal + ochre + single magenta spark at center — don't alter)
- Eyebrow line: teal `#0f766e`, JetBrains Mono 600, uppercase, 14px with letter-spacing 0.15em
- Headline: ink `#0b1f1a`, Inter 600, ~56px display, tracking -0.02em, three lines max
- `biokea.ai` tagline: teal `#0f766e`, JetBrains Mono 500, 18px
- Mascot in corner: teal `#0f766e` line version of the mascot from `logo2-white.png` → inverted to teal in post

### Prompts

**Approach:** AI image generators notoriously garble text at this size. **Recommended:** generate the background (cream paper + grid + LDC positioned left) without text, then typeset the headline block in Figma or Illustrator with Inter + JetBrains Mono. If you must generate text, use **Ideogram.ai** which handles typography better than Midjourney/DALL·E/SDXL.

#### Midjourney v7 — background composition (text typeset later)

```
Editorial open-graph card design, 1200 by 630 pixels, horizontal layout.
Left half: a circular scientific illustration of a DNA double helix
converging at a central magenta spark, drawn in deep teal #0f766e line
work with ochre #92400e tick-marks, on a warm cream #F3EFE6 paper
background. Right half: empty cream space, waiting for a typeset headline.
Subtle blueprint grid underlay at 3 percent opacity across the whole
composition. Flat draftsman style. No glow. No drop shadows. No gradients.
Calm, understated, editorial — NotebookLM aesthetic. --ar 1200:630
--style raw --v 7 --s 50
```

#### DALL·E 3 — background composition

```
A horizontal 1200x630 open-graph share card, warm cream #F3EFE6 paper
background with a very subtle blueprint grid at 3% opacity. In the left
half, a circular scientific illustration: DNA double helix converging
horizontally at a central small magenta #be185d spark, drawn with deep
teal #0f766e line work and ochre #92400e tick marks around the outer
ring. The right half is empty cream paper, reserved for typeset text
to be added later. Flat draftsman technical illustration style. No glow,
no gradients, no drop shadows. Calm, editorial, NotebookLM-inspired.
```

#### Ideogram.ai — full composition with text (experimental)

Ideogram renders type reliably. Try:

```
Editorial open-graph card. Cream paper #F3EFE6 background. Left half:
circular DNA-collision illustration in teal line work. Right half: three
stacked text lines on cream. First line small mono caps: "BIOKEA ·
BERKELEY, CA" in teal. Second line large display sans-serif: "Biology,
decoded in the public interest." in black. Third line mono: "biokea.ai"
in teal. Flat editorial style, no glow, no shadows. 1200x630.
```

If Ideogram renders the text cleanly, use it; otherwise post-process.

#### SDXL / Flux

Positive:

```
editorial open-graph card, horizontal 1200x630, cream paper background
F3EFE6, left half circular DNA collision illustration in teal line work
0f766e, ochre tick-marks 92400e, single magenta spark be185d at center,
right half empty cream space, subtle blueprint grid underlay, flat
draftsman scientific illustration, NotebookLM editorial style,
Linear.app illustration feel
```

Negative:

```
glow, neon, bloom, halo, dark background, navy, cyan, saturated yellow,
sci-fi, game HUD, drop shadow, heavy gradient, 3D render, photoreal,
text, wordmark, logo, lettering, watermark, signature, lowres, blurry
```

CFG 4–6, steps 30–50, sampler DPM++ 2M Karras, SDXL base or Flux-dev.

### Post-production (Figma or Illustrator)

1. Import generated background at 1200×630.
2. Place the LDC illustration (if not already embedded) at ~520×520, vertically centered, 80px from left edge.
3. Typeset the three text lines on the right half:
   - Eyebrow: `BIOKEA · BERKELEY, CA` — Inter/JetBrains Mono 600, 14px, teal `#0f766e`, letter-spacing 0.15em
   - Headline: `Biology, decoded in the public interest.` — Inter 600, 56px, ink `#0b1f1a`, tracking -0.02em, leading 1.05, max 3 lines
   - Tagline: `biokea.ai` — JetBrains Mono 500, 18px, teal `#0f766e`
4. Place the small mascot mark (teal) bottom-right, 60px tall, 40px margin.
5. Export as JPEG quality 85 with `-strip` to remove metadata.
6. Confirm filesize ≤ 200 KB.
7. Verify in Metatags.io preview tool before shipping.

### Common failure modes

- **Text garbled** — unavoidable in most generators. Typeset manually.
- **Illustration too glowy** — reject, regenerate with stronger "flat draftsman" emphasis.
- **Edge bleed** — OG parsers commonly crop 40px from each side. Keep all critical content inside a 1120×550 safe area.
- **Color shift to orange/yellow** — SDXL occasionally drifts warm. Check the hex values in the output with a picker; regenerate if teal has become olive.
- **Over-decoration** — fight the model's instinct to fill empty space. The right half should stay largely empty for text.

### Variants for /lab and /agentis

Reuse the home composition. Swap only the eyebrow text:

- `/lab` eyebrow: `BIOKEA LAB · BERKELEY, CA`
- `/agentis` eyebrow: `AGENTIS · AT PROTOCOL JOURNAL`
- Home headline: `Biology, decoded in the public interest.`
- `/lab` headline: `5,000+ sq ft. An open lab in Berkeley.`
- `/agentis` headline: `An AI-first scientific journal.`

The three cards sit in a family — same composition, different copy.

### Site integration

After shipping, update `src/components/layout/Seo.astro` so each page passes the correct OG filename. For home/ lab / agentis routes specifically:

```astro
<Seo ... ogImage="/assets/images/og-home.jpg" />
<Seo ... ogImage="/assets/images/og-lab.jpg" />
<Seo ... ogImage="/assets/images/og-agentis.jpg" />
```

The existing Seo component already accepts `ogImage` as a prop.

---

## 2. Favicon ⭐

**Why it matters:** every browser tab showing a BioKEA page, every iOS home-screen bookmark, every Android adaptive icon, every search-engine result. Tiny but everywhere.

**Source of truth:** the existing `logo2.png` (or `logo2-white.png`) has a beautiful mascot (the robot-DNA character). The mascot alone — without the wordmark — is the favicon. Too much detail will mud at 16×16.

### Delivery spec — a set of files

| Purpose                       | Filename                            | Dimensions              | Format              |
| ----------------------------- | ----------------------------------- | ----------------------- | ------------------- |
| Modern SVG favicon            | `public/favicon.svg`                | vector, viewBox 512×512 | SVG                 |
| Safari pinned-tab             | `public/safari-pinned.svg`          | monochrome SVG          | SVG, fill `#0f766e` |
| iOS touch icon                | `public/apple-touch-icon.png`       | 180×180                 | PNG                 |
| Android adaptive (foreground) | `public/android-chrome-192x192.png` | 192×192                 | PNG, transparent    |
| Android adaptive (large)      | `public/android-chrome-512x512.png` | 512×512                 | PNG, transparent    |
| Legacy ICO (multi-size)       | `public/favicon.ico`                | 16/32/48 stacked        | ICO                 |
| Web manifest                  | `public/site.webmanifest`           | JSON                    | —                   |

Alt text: "BioKEA mascot — a small robot figure holding a DNA helix."

### Concept anchors

- **Mascot only.** No "BioKEA" wordmark at this size.
- **Teal `#0f766e` on transparent** for all PNG/SVG exports.
- **Circular safe area** — the mascot must sit within a 90%-inset circle so iOS home-screen rounding doesn't clip it.
- **Single color.** No detail beyond the mascot silhouette + internal DNA helix lines.

### Production approach

AI image generators are **the wrong tool** for favicons. The right tools:

**Option A — recommended: vectorize the existing mascot**

1. Open `public/assets/images/logo2.png` in Figma or Illustrator.
2. Isolate the mascot (crop out the "BioKEA" wordmark).
3. Use **Image Trace** (Illustrator) or **Vectorize** (Figma plugin) — tune so the mascot becomes clean vector paths with ~20–30 anchor points total. Simplify.
4. Recolor all paths to teal `#0f766e`.
5. Export SVG (`favicon.svg`).
6. Export PNG at 180×180 (`apple-touch-icon.png`), 192×192 (`android-chrome-192x192.png`), 512×512 (`android-chrome-512x512.png`).
7. Generate `favicon.ico` using [RealFaviconGenerator](https://realfavicongenerator.net/) from the 512×512 PNG.
8. Generate monochrome `safari-pinned.svg` with all paths filled `#0f766e`.

**Option B — Recraft.ai (AI vector generation, fallback)**

Recraft outputs SVG directly. Prompt:

```
Minimalist icon of a small round-headed robot figure whose body is
formed by a DNA double helix. Single color deep teal #0f766e on
transparent background. Flat vector line-art, no shading, no gradients,
no glow. Centered in a square canvas with 10% padding. Inspired by the
BioKEA mascot — friendly, simple, recognizable at 32 pixels.
```

Then manually simplify in Figma/Illustrator before exporting. Recraft output tends to be over-detailed; aim for ≤ 30 anchor points total.

### Web manifest (site.webmanifest)

Drop this file alongside the favicon PNGs:

```json
{
  "name": "BioKEA",
  "short_name": "BioKEA",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#0b1f1a",
  "background_color": "#F3EFE6",
  "display": "standalone"
}
```

### Site integration

After shipping, update `src/layouts/BaseLayout.astro` `<head>`:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="mask-icon" href="/safari-pinned.svg" color="#0f766e" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#0b1f1a" />
```

### Common failure modes

- **Detail loss at 16×16** — test at actual size before shipping. Squint at the 16×16 in a browser tab; if the mascot isn't instantly recognizable, simplify.
- **Off-center after iOS rounding** — Apple clips a ~10% border radius on home-screen icons. Confirm no critical detail is within the outer 10%.
- **Color shift on dark mode** — Safari in dark mode inverts some icons. Use the dedicated `safari-pinned.svg` (monochrome) to prevent this.
- **PWA install uses wrong icon** — the manifest needs both 192 and 512 PNGs present at those exact pixel dimensions.

---

## 3. Bay Area "where we are" map ⭐

**Why it matters:** the "scrappy Bay Area auction circuit + three partner institutions" story is hard to grasp from text alone. A single editorial map makes the geography self-evident: BioKEA in Berkeley, CIB / SFEI / Coastal Quest as partner pins, San Jose and SF as nearby cities the auction hunt pulled from.

### Delivery spec

|              |                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/bay-area-map.webp`                                                                                                                                         |
| Dimensions   | 1200 × 900 (landscape 4:3)                                                                                                                                                       |
| Format       | WebP, quality 85                                                                                                                                                                 |
| Max filesize | ≤ 120 KB                                                                                                                                                                         |
| Background   | Cream `#F3EFE6` — or transparent if rendered cleanly enough                                                                                                                      |
| Colorspace   | sRGB                                                                                                                                                                             |
| Alt text     | "A hand-drawn editorial map of the San Francisco Bay Area showing BioKEA's Berkeley lab and partner institutions at CIB (Marin), SFEI (Richmond), and Coastal Quest (Bay Area)." |

### Concept anchors

- **Hand-drawn editorial feel**, not a satellite map or Google Maps screenshot. Pen-and-ink style, as if drawn in a naturalist's field notebook.
- **The Bay and coastline** rendered as teal contour lines with a subtle ochre beachline hairline.
- **Five pins**, each color-coded by role:
  - **Teal pin (primary):** BioKEA · Berkeley, labeled "BioKEA · LDC"
  - **Teal secondary pins** for the three partners: CIB (their actual Bay Area location), SFEI (Richmond, CA), Coastal Quest (San Francisco, CA)
  - **Ochre small pins** on the three auction-circuit cities (San Jose, San Francisco, Berkeley) — smaller, labeled in mono caps
- **Compass rose** top-left, editorial style, teal line
- **Subtle blueprint grid** at 3% opacity
- **North = up.**
- **No roads, no freeways, no modern infrastructure noise.** Just the shape of the Bay and the labeled points of interest.

### ASCII composition sketch

```
┌────────────────────────────────────────────────────┐
│  N↑                                                │
│                      ╭─CIB─╮                       │
│                   ╭──╯     ╰──╮                    │
│              ╭────╯            ╰─ BioKEA·LDC ●    │
│            ╭─╯                  ╰╮                 │
│           ╱    (San Francisco   SFEI ● ─╮          │
│          ╱      Bay — teal      │       │          │
│         ╱       contour fill)   │       ╰─╮        │
│        │                        │         │        │
│   Coastal Quest ●                ╰─╮     ╰──╮     │
│          ╲                          ╰──╮    │     │
│           ╲                            ╰──╮ │     │
│            ╲      · SF auction           │ │     │
│             ╲     · San Jose auction      │ │     │
│              ╲────────────────────────────╯ │     │
│                                              ╰───┘│
└────────────────────────────────────────────────────┘
 1200 × 900,  cream ground, teal contour, ochre beach
```

### Palette usage

- Ground: cream `#F3EFE6`
- Bay (water): very light teal tint `rgba(15,118,110,0.08)` fill with a `#0f766e` edge contour
- Coastline: teal `#0f766e` hairline
- Beaches/dunes (optional): ochre `#92400e` dashed hairline
- Land mass: cream, no fill — the coastline alone defines it
- Partner pins: teal `#0f766e` filled circles, 10px
- Primary BioKEA pin: larger teal circle with an ink `#0b1f1a` bullseye and a single magenta `#be185d` dot (the one earned spark)
- Auction-circuit pins: ochre `#92400e` small x-marks or ticks
- Labels: ink `#0b1f1a` for headings, slate `#475569` for subtitles
- Grid: slate `rgba(30,41,59,0.04)` background

### Prompts

Map generation is fiddly. **Recommend a two-step process:**

**Step 1 — generate the base map** without labels (just the coastline + water + compass + grid)

**Step 2 — typeset labels + pins** in Figma atop the generated base.

Alternative: **Mapbox Studio** with a custom cream + teal style, then export as PNG, post-produced with hand-drawn touches. This may actually be faster than AI generation for a geographic map that needs to be accurate.

#### Midjourney v7

```
Hand-drawn editorial map of the San Francisco Bay Area, pen-and-ink
style, vintage naturalist field-notebook aesthetic. Cream paper
background #F3EFE6 with a subtle 3 percent opacity blueprint grid.
Teal #0f766e contour hairlines define the coast and the Bay itself.
Ochre #92400e dashed hairlines suggest beaches. No roads, no freeways,
no modern infrastructure — just coastline, water, and the compass rose
top-left. Clean, understated, editorial. Flat draftsman line weight.
No text, no labels, no pins yet — those will be added in post.
--ar 4:3 --style raw --v 7 --s 50
```

#### DALL·E 3

```
A 1200x900 hand-drawn editorial map of the San Francisco Bay Area on
warm cream #F3EFE6 paper with a 3% opacity blueprint grid. Render only
the coastline and Bay in deep teal #0f766e hairlines with very light
teal tint fill inside the Bay itself. Ochre #92400e dashed hairline
along beaches. A small compass rose top-left in teal line. No roads,
no freeways, no highways, no cities labeled, no pins. Just the Bay
geography, clean naturalist pen-and-ink style. Flat, no drop shadows,
no gradient, no color outside the palette specified.
```

#### SDXL / Flux

Positive:

```
hand-drawn editorial vintage map of San Francisco Bay Area, pen and
ink illustration, naturalist field notebook style, cream paper F3EFE6
background, subtle blueprint grid, teal 0f766e coastline hairline, Bay
with light teal tint, ochre 92400e beach dashed line, compass rose top
left, no roads, no modern infrastructure, Linear.app illustration
feel, NotebookLM editorial
```

Negative:

```
satellite image, aerial photograph, Google Maps screenshot, roads,
freeways, highways, modern infrastructure, labels, text, pins, color,
saturated, dark, navy, glow, 3D, photograph, tourist map, cartoon
```

CFG 5, steps 40, SDXL base.

### Post-production (Figma)

1. Import the generated base at 1200×900.
2. Verify geographic accuracy — if the Bay shape is wrong, regenerate or redraw. The coastline should clearly show the Golden Gate, Richmond, Oakland/Berkeley waterfront, the peninsula, and the South Bay.
3. Place five location pins:
   - **BioKEA · LDC** in Berkeley — large teal circle, ink center, magenta dot
   - **CIB** (California Institute of Biodiversity) — wherever their Bay Area office is. Teal filled circle, 10px.
   - **SFEI** (San Francisco Estuary Institute) — Richmond, CA. Teal filled circle, 10px.
   - **Coastal Quest** — San Francisco. Teal filled circle, 10px.
4. Place three auction-circuit ticks:
   - San Jose, San Francisco, Berkeley — ochre x-marks or tiny crosses with ochre mono labels "BIOTECH AUCTION" at small size.
5. Typeset labels: ink `#0b1f1a` Inter 500 14px for partner/primary names, slate `#475569` 11px for subtitles (roles), ochre mono 10px for cities.
6. Add a hairline frame border at 2px teal, 20px inset from the canvas edges.
7. Add a small subtitle block bottom-right: `BioKEA · Bay Area, California · 2026` in slate mono.
8. Export WebP quality 85, strip metadata.

### Common failure modes

- **Wrong coastline** — Bay geography is distinctive; AI generators often flatten or mirror it. If the Golden Gate isn't recognizable, redraw manually.
- **Satellite-image artifacts** — you'll see ghost-roads, building outlines, green forested zones creeping in. Reject and regenerate with stronger naturalist / pen-and-ink emphasis.
- **Labels colliding** — Richmond and Berkeley are close together; SFEI and CIB may overlap visually. Use leader lines (thin teal with a small circle dot) to push labels off the pin.
- **Compass rose too ornate** — keep it simple, just N/S/E/W ticks.

### Site integration

Insert as a full-width figure on the homepage (below the Evidence section, above Ecosystem) OR as a section break on `/lab` between the warehouse photos and the current-state stats. Decide based on where you want the geographic story to land. Recommended: homepage, below the LDC evidence block.

```astro
<figure class="max-w-5xl mx-auto px-6 py-8">
  <img
    src="/assets/images/bay-area-map.webp"
    alt="..."
    width="1200"
    height="900"
    class="w-full rounded-md"
    loading="lazy"
  />
  <figcaption class="mt-3 font-mono text-[11px] text-slate-500 tracking-[0.08em]">
    FIG · BAY AREA — BioKEA Berkeley & partner institutions
  </figcaption>
</figure>
```

---

# TIER 2 — deepen the story

---

## 4. Soil | Water | Specimen → Claim horizontal pipeline illustration

**Why it matters:** The `/pipeline` page currently tells the 6-stage story in a vertical text list. A single horizontal flow illustration at the top of the page makes the journey visual and memorable.

### Delivery spec

|              |                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Filename     | `public/assets/images/pipeline-flow.webp`                                                                                                                                |
| Dimensions   | 2000 × 500 (ultrawide 4:1)                                                                                                                                               |
| Format       | WebP, quality 85                                                                                                                                                         |
| Max filesize | ≤ 140 KB                                                                                                                                                                 |
| Background   | Cream `#F3EFE6` or transparent                                                                                                                                           |
| Alt text     | "The BioKEA pipeline: field samples (soil, water, specimen) flow through Ingest, Analyze, Draft, Review, Broadcast, and Amplify to become verifiable scientific claims." |

### Concept anchors

- **Horizontal left-to-right flow.** Reads like a subway map or a process diagram.
- **Left end:** three small icons stacked — a soil sample vial, a water droplet, a specimen silhouette (aquatic organism) — converging into a single flowline.
- **Middle:** six nodes at even intervals, each a small circular station labeled with a stage number + title (01 Ingest, 02 Analyze, 03 Draft, 04 Review, 05 Broadcast, 06 Amplify).
- **Right end:** the output — a small stylized StoryMap / scientific-claim artifact, ending with a magenta spark to signal "cite-able."
- **Connecting line:** teal, 2–3px weight, with subtle tick-marks between stations.
- **No text labels on icons themselves** (typeset in post for crispness).

### Palette usage

- Ground: cream (or transparent)
- Flow line: teal `#0f766e`
- Station circles: white/cream fill with teal outline
- Station numbers (if included in generation): mono ochre `#92400e`
- Input icons (soil/water/specimen): teal with ochre fill-accents
- Output claim: teal outline, single magenta `#be185d` spark
- Blueprint grid at 3% in background

### Prompts

#### Midjourney v7

```
Horizontal editorial pipeline illustration, 4:1 ultrawide composition,
left-to-right flow. Three small input icons on the left (soil vial,
water droplet, aquatic specimen silhouette) merge into a single teal
flow line that passes through six circular station nodes evenly spaced
across the canvas, ending on the right with a small stylized scientific
document artifact and a single magenta spark. Teal #0f766e line work
on cream #F3EFE6 paper background, ochre #92400e accent tick-marks
between stations. Flat draftsman style, blueprint grid at 3 percent.
No text yet. No glow, no gradient, no drop shadow. Linear.app-inspired
editorial. --ar 4:1 --style raw --v 7 --s 50
```

#### DALL·E 3

```
A 2000x500 ultrawide horizontal pipeline diagram on cream #F3EFE6
paper. Left side: three small teal-line icons (a soil sample vial,
a water droplet, an aquatic organism silhouette) converging into a
single teal #0f766e flow line. This line runs across to six evenly-
spaced circular stations, each a small white-filled circle with a
teal outline. Between stations: ochre #92400e tick marks. Line ends
on the right with a small stylized scientific document icon and a
single magenta #be185d spark. Flat draftsman editorial style, no
gradients, no glow, no drop shadows. Subtle 3% blueprint grid
underlay. No station labels — those will be added in post.
```

#### SDXL / Flux

Positive:

```
horizontal pipeline illustration, 4:1 ultrawide, cream paper F3EFE6,
left to right flow, three input icons merging, six circular stations,
final output document icon, magenta spark at end, teal line work
0f766e, ochre tick-marks 92400e, flat draftsman blueprint style,
NotebookLM editorial
```

Negative:

```
glow, neon, dark background, text, labels, words, arrows with text,
game HUD, 3D render, drop shadow, gradient fill, photoreal
```

### Post-production

1. Typeset station labels above or below each circle:
   - 01 Ingest — 02 Analyze — 03 Draft — 04 Review — 05 Broadcast — 06 Amplify
   - Inter 600 for the number (teal), Inter 500 for the name (ink)
   - Mono subtitle in slate below each (Universal Envelope / LDC / AI-assisted / Multi-agent / StoryMap / ATProto)
2. Ensure the flow reads as one continuous line — no breaks.
3. Export WebP 85.

### Site integration

Replace or augment the text-based stage list at the top of `/pipeline`.

---

## 5. Agentis discourse graph illustration

**Why it matters:** The "every publication is a signed AT Protocol record, every review is verifiable" idea is abstract until shown. A single graph illustration makes the trust layer feel real.

### Delivery spec

|              |                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/agentis-discourse-graph.webp`                                                                                                  |
| Dimensions   | 1200 × 1200 (square)                                                                                                                                 |
| Format       | WebP, quality 85                                                                                                                                     |
| Max filesize | ≤ 110 KB                                                                                                                                             |
| Background   | Transparent or cream `#F3EFE6`                                                                                                                       |
| Alt text     | "A lattice of interconnected signed publication nodes on the AT Protocol, illustrating verifiable peer review and transparent scientific discourse." |

### Concept anchors

- **A lattice of nodes** — circles representing publications — connected by lines (citations, reviews, data-provenance links).
- **Some nodes are filled teal** (accepted/published), some are outlined ochre (in review), one is highlighted with a magenta ring (a newly-published or contested claim).
- **Each connecting line is labeled implicitly** with a tiny icon — a cryptographic lock symbol, a quill (review), a data file (citation).
- **No real-world text.** The typography is purely suggestive — looks like a directed acyclic graph viewer rendered in editorial line-art.
- **Reference:** slide 10 of `docs/references/AI_First_Bio_Publishing.pdf` (the "Connecting the Dots: The Agentis Knowledge Graph" illustration). Aim for that register.

### Palette usage

- Ground: cream or transparent
- Accepted nodes: teal `#0f766e` fill
- In-review nodes: ochre `#92400e` outline, white/cream fill
- Highlighted node (earned spark): single magenta `#be185d` ring around a single node
- Connecting lines: thin teal, hairline weight
- Icons on lines: slate `#475569`

### Prompts

#### Midjourney v7

```
Editorial illustration of a directed knowledge graph, lattice of 20
to 30 small circular nodes connected by thin teal hairlines. Some nodes
filled solid teal #0f766e, others outlined in ochre #92400e with white
interior. One node highlighted with a single magenta #be185d ring.
Cream #F3EFE6 paper background with a subtle blueprint grid at 3
percent. Tiny abstract glyph markers along some connecting lines
suggesting verification (lock icons, quill marks) — but no literal
text. Flat draftsman editorial style. --ar 1:1 --style raw --v 7 --s 50
```

#### DALL·E 3

```
A 1200x1200 square editorial graph illustration on cream #F3EFE6 paper.
A lattice of about 25 small circular nodes connected by thin teal
#0f766e hairlines. Some nodes are filled solid teal, others are
outlined ochre #92400e with empty white centers. One central node has
a magenta #be185d highlight ring. Tiny abstract marker glyphs along
some edges (abstract lock shapes, quill shapes) — no real text.
Subtle 3% blueprint grid. Flat draftsman editorial style, inspired by
NotebookLM knowledge graph illustrations. No glow, no gradients, no
drop shadows.
```

#### SDXL / Flux

Positive:

```
editorial knowledge graph illustration, square 1:1, lattice of
circular nodes connected by hairlines, teal 0f766e and ochre 92400e
two-tone, single magenta spark ring, cream F3EFE6 paper, blueprint
grid underlay, flat draftsman editorial style, NotebookLM inspired,
Linear.app illustration feel, no text
```

Negative:

```
text, lettering, labels, words, glow, neon, dark background, 3D render,
drop shadow, gradient, photoreal, cartoon, heavy fill
```

### Post-production

Add a section title below the illustration in Figma: `FIG · AGENTIS DISCOURSE GRAPH` in mono slate.

### Site integration

Drops into `/agentis` between the hero and the three concept cards, as a full-width figure.

---

## 6. Agentis StoryMap mockup

**Why it matters:** The "StoryMap, not dead PDF" pitch needs a visual proof point. Show what a published Agentis artifact looks like.

### Delivery spec

|              |                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Filename     | `public/assets/images/agentis-storymap-mockup.webp`                                                                                                                      |
| Dimensions   | 1600 × 1100 (landscape)                                                                                                                                                  |
| Format       | WebP, quality 85                                                                                                                                                         |
| Max filesize | ≤ 200 KB                                                                                                                                                                 |
| Background   | Cream `#F3EFE6` (with the mockup framed inside it)                                                                                                                       |
| Alt text     | "A mockup of an Agentis StoryMap: an interactive scientific publication with map, data, FAIR package badges, and inline citations, displayed in a laptop browser frame." |

### Concept anchors

- **A laptop / browser frame** (editorial line-art, not photoreal) containing a mock Agentis StoryMap page.
- **Inside the frame:**
  - Left 60%: a hand-drawn map of a study region with sample-collection points as teal circles, some with ochre labels (e.g., "Site 12", "Site 18")
  - Right 40%: a scientific narrative panel with:
    - Eyebrow: `AGENTIS · PEER REVIEWED`
    - Headline: "Novel Glomeromycota Lineages in Santa Monica Mountains Soils"
    - Three short paragraphs of lorem-style text (will be replaced with editorial filler)
    - Inline citations as teal-colored numbers
    - A row of FAIR-package badges at bottom: `GBIF` `NCBI SRA` `ZENODO` in mono caps
- **Browser chrome:** simple pen-and-ink outline, URL bar suggesting `agentis.science/papers/glomeromycota-smm-2026`
- **No real text** — all letters should be editorial lorem, not readable detail

### Prompts

#### Midjourney v7

```
Editorial illustration of a laptop showing an interactive scientific
publication. Pen-and-ink line art of a laptop frame in teal #0f766e
on cream #F3EFE6 paper. The screen shows a two-column layout: left
column a hand-drawn map of a mountainous region with small teal sample
point circles and ochre labels; right column a scientific narrative
with a short headline, three paragraphs of lorem text, and a row of
FAIR data badges at bottom. Subtle 3 percent blueprint grid behind
everything. Flat draftsman style. No glow, no gradient, no drop
shadow. NotebookLM editorial aesthetic. --ar 16:11 --style raw --v 7
--s 50
```

#### DALL·E 3

```
A 1600x1100 landscape editorial illustration on warm cream #F3EFE6
paper. Center subject: a pen-and-ink line drawing of a laptop in deep
teal #0f766e hairlines. On the laptop screen, a two-column scientific
publication layout: left 60% shows a hand-drawn map of a mountainous
study area with small teal sample-point circles and ochre site labels;
right 40% shows a narrative panel with a headline, three short
paragraphs of editorial lorem-ipsum text, inline teal citation numbers,
and a bottom row of three small FAIR data-package badges. Subtle 3%
blueprint grid in the background. Flat draftsman editorial style. No
glow, no gradients, no drop shadows.
```

#### SDXL / Flux

Positive:

```
editorial line-art illustration of laptop showing scientific article
with map and text, teal 0f766e ink on cream F3EFE6 paper, pen and ink
technical drawing, blueprint grid underlay, NotebookLM inspired,
Linear.app feel, lorem text on screen, map with sample points
```

Negative:

```
photograph, photoreal, 3D render, game HUD, glow, neon, saturated,
dark background, heavy shadow, cartoon
```

### Post-production

No typesetting needed — the mockup's text is meant to read as illegible editorial lorem. Just ensure no real words are accidentally generated that could mislead.

### Site integration

Place on `/agentis` below the concept cards.

---

# TIER 3 — texture and polish

---

## 7. Taxonomic tree snippet

**Why it matters:** small editorial touch; emphasizes BioKEA's biological domain.

### Delivery spec

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| Filename     | `public/assets/images/taxonomic-tree.webp`                           |
| Dimensions   | 400 × 800 (vertical sidebar)                                         |
| Format       | WebP quality 85                                                      |
| Max filesize | ≤ 50 KB                                                              |
| Background   | Transparent                                                          |
| Alt text     | "A small phylogenetic tree illustration in editorial teal line-art." |

### Concept anchors

- A vertical phylogenetic branching tree, maybe 3 levels of branching, ~12 terminal tips.
- Tips suggest small species silhouettes (optional — a fish, a mollusk, a plant leaf, a microbe — all very small and schematic).
- Rooted at the top, radiating branches downward.

### Prompts

#### Midjourney

```
Small vertical phylogenetic tree illustration, pen-and-ink editorial
line-art, teal #0f766e hairlines on transparent background, three
levels of binary branching, about twelve terminal tips, some tips
suggest tiny abstract species silhouettes in ochre #92400e. Flat
draftsman style, no glow, no gradients. --ar 1:2 --style raw --v 7
```

#### DALL·E 3 / SDXL

Variant of above — see the general style anchors.

### Site integration

Floats in a left margin on `/pipeline` near the Analyze stage, or in the `/mission` sidebar.

---

## 8. Specimen marginalia (4 micro-illustrations)

**Why it matters:** small textural touches that make the site feel like a naturalist's notebook.

### Delivery spec (one file per specimen)

| Filename                                 | Subject                         | Dimensions |
| ---------------------------------------- | ------------------------------- | ---------- |
| `public/assets/images/marg-fish.webp`    | A small aquatic fish silhouette | 200 × 200  |
| `public/assets/images/marg-daphnia.webp` | A daphnia (water flea)          | 200 × 200  |
| `public/assets/images/marg-leaf.webp`    | A leaf with veining             | 200 × 200  |
| `public/assets/images/marg-diatom.webp`  | A diatom (microscopic alga)     | 200 × 200  |

All transparent background, teal `#0f766e` line-art, ≤ 12 KB each.

### Prompts

#### Midjourney (per specimen)

```
Tiny editorial naturalist illustration of a [SPECIMEN] in pen-and-ink
line-art style, teal #0f766e single color on transparent background,
centered with 10 percent padding, flat draftsman style, no glow, no
gradient, no color. Like a plate from a vintage scientific atlas.
--ar 1:1 --style raw --v 7
```

Substitute `[SPECIMEN]` with: `freshwater fish`, `daphnia water flea`, `deciduous leaf with visible veins`, `circular diatom under microscope`.

### Site integration

Used as decorative accents at eyebrows, in the milestone list, or in the footer.

---

## 9. CTA band stamp / seal motif

**Why it matters:** the dark CTA bands at page bottoms are currently plain typography. A small seal or stamp graphic next to the text adds craft.

### Delivery spec

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/cta-seal.webp`                                                           |
| Dimensions   | 200 × 200                                                                                      |
| Format       | WebP, transparent                                                                              |
| Max filesize | ≤ 20 KB                                                                                        |
| Alt text     | "BioKEA editorial seal — a circular stamp with the mascot and a mono wordmark around the rim." |

### Concept anchors

A circular embossed-seal motif: outer ring with mono text "BIOKEA · BERKELEY · EST. 2025", center holds the mascot silhouette. Similar in vibe to a wax seal on a letter, but rendered as flat line-art.

### Prompts

#### Midjourney

```
Editorial circular seal / stamp design, pen-and-ink line-art, teal
#0f766e on transparent background. Outer ring contains mono caps
text "BIOKEA · BERKELEY · EST 2025" wrapping around the edge. Center
holds a small stylized robot-DNA mascot silhouette. Flat draftsman
style, no glow, no gradient. Looks like a wax seal but in pure line
work. --ar 1:1 --style raw --v 7
```

### Post-production

Text rendering around the ring usually fails. Plan to typeset the wordmark in Figma after generating the central mascot + ring.

### Site integration

Place to the left of the CTA band headline, 40px tall on mobile, 60px on desktop.

---

## 10. Field sampling photograph

**Why it matters:** all current BioKEA visuals are illustrations or lab interiors. A real photograph of water sampling grounds the "aquatic eDNA specialist" story with human-in-the-field truth.

### Approach recommendation

**Strongly prefer:** a real photograph of Sean, Michelle, or Austin collecting a water sample in the field. Actual photography beats any AI generation for credibility on a science site. Use a phone camera, good natural light, roughly 3:2 composition.

**Direction if shooting:**

- Subject knee-deep or crouched beside water
- Holding a sample vial or filter apparatus
- Wearing field gear (hat, sunscreen, practical clothing)
- Background: a natural California landscape (creek, coast, marsh, pond)
- Natural light, midday or golden hour
- Medium shot — subject from knees up
- Ideally one in portrait + one in landscape

### Delivery spec

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/field-sampling.jpg`                                       |
| Dimensions   | 1800 × 1200 (3:2 landscape)                                                     |
| Format       | JPEG quality 82                                                                 |
| Max filesize | ≤ 280 KB                                                                        |
| Alt text     | "A BioKEA team member collecting a water sample in a California coastal creek." |

### If AI-generating instead (fallback)

**Use Midjourney v7 photoreal with niji-off, or Flux Realism.** AI-generated science photos still show up as "off" — fingers wrong, gear brand logos garbled, impossible lighting. This should only be a stopgap.

#### Midjourney

```
Photorealistic medium shot of a field scientist crouched beside a
California coastal creek collecting a water sample into a sterile
vial. Natural midday lighting, soft shadows, 35mm lens look.
Subject wearing field gear (sun hat, earth-tone technical shirt,
work pants). Authentic documentary science photography. No logos,
no brand text, no artifacts. --ar 3:2 --style raw --v 7
```

### Post-production

- Crop to 1800×1200.
- Mild color grade: warm cream/teal editorial tint (subtract ~5% saturation, warm whites by +3 temperature).
- Export JPEG 82.

---

# TIER 4 — aspirational

---

## 11. LDC interior isometric cutaway

**Why it matters:** a rich, explorable illustration of the lab interior organized by pipeline stage. The ultimate "scale of what we built" image.

### Delivery spec

|              |                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/ldc-interior-iso.webp`                                                                                                                         |
| Dimensions   | 1800 × 1200                                                                                                                                                          |
| Format       | WebP quality 85                                                                                                                                                      |
| Max filesize | ≤ 250 KB                                                                                                                                                             |
| Background   | Cream `#F3EFE6`                                                                                                                                                      |
| Alt text     | "An isometric cutaway illustration of the BioKEA Berkeley lab, showing extraction, prep, quantification, and sequencing equipment arranged along the pipeline flow." |

### Concept anchors

- Isometric axonometric projection at 30° angle.
- **Lab floorplan** viewed from above-and-to-the-side, rendered as editorial line-art.
- Four equipment zones visible, labeled by stage (01 Extraction / 02 Prep / 03 Quantification / 04 Sequencing).
- Each zone populated with simplified editorial renderings of the actual hardware (KingFisher carousels, QIAgility, Roche LightCyclers, Promethion 2).
- Subtle teal/ochre color coding per zone.
- Flow arrows showing sample movement through the zones.

### Prompts

#### Midjourney

```
Isometric editorial illustration of a biology laboratory interior,
axonometric 30 degree projection, cutaway from above. Four labeled
zones for extraction, prep, quantification, and sequencing, each with
simplified line-art renderings of lab equipment. Teal #0f766e primary
line work, ochre #92400e zone accents, single magenta #be185d
highlight on one piece of flagship equipment. Cream #F3EFE6 paper
background, subtle blueprint grid. Flat draftsman style like a
vintage architectural manual. --ar 3:2 --style raw --v 7 --s 50
```

This is ambitious for AI. Expect multiple regeneration rounds. Consider an illustrator instead.

### Site integration

Replaces or augments `lab-equipment-pipeline.jpg` on `/lab`.

---

## 12. Cream-palette species-discovery heatmap

**Why it matters:** the current `lab-diversityscanner-heatmaps.jpg` is a color-JPG from the capabilities deck with neon heatmap tints. Recreating it in the cream palette unifies the DiversityScanner section.

### Delivery spec

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| Filename     | `public/assets/images/diversityscanner-heatmaps-cream.webp` |
| Dimensions   | 800 × 600 (2×2 grid of 4 panels)                            |
| Format       | WebP quality 85                                             |
| Max filesize | ≤ 80 KB                                                     |
| Background   | Cream `#F3EFE6`                                             |

### Concept anchors

Four small specimen images in a 2×2 grid, each overlaid with a topographic-style attention-map rendered in teal/ochre hairlines instead of saturated color heatmaps. Subtle magenta spark at the highest-attention region on one specimen only.

### Prompts

#### Midjourney

```
A 2x2 grid of four editorial scientific illustrations. Each panel
shows a small insect or arthropod specimen rendered in teal
#0f766e line-art on cream #F3EFE6, overlaid with topographic
contour hairlines in ochre #92400e suggesting an attention
heatmap. One specimen has a small magenta #be185d spark at its
focal region. Flat draftsman editorial style like a vintage
biology plate. --ar 4:3 --style raw --v 7 --s 50
```

### Site integration

Replaces the existing DiversityScanner heatmap image on `/lab`.

---

## 13. Press kit composite

**Why it matters:** for journalists and partner organizations writing about BioKEA. A single high-res composite with logo + LDC + wordmark + tagline + attribution.

### Delivery spec

|              |                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------- |
| Filename     | `public/assets/images/press-kit-composite.png`                                               |
| Dimensions   | 3000 × 2000                                                                                  |
| Format       | PNG (not WebP — press kits prefer lossless)                                                  |
| Max filesize | ≤ 800 KB                                                                                     |
| Background   | Cream `#F3EFE6`                                                                              |
| Alt text     | "BioKEA press kit composite: logo, Large Data Collider illustration, wordmark, and tagline." |

### Composition

- Top-left: the BioKEA logo (from `logo2.png`) at large size
- Center: the LDC illustration
- Below: the wordmark "BioKEA" in Inter 700 at 180pt, ink
- Below that: tagline "An AI company with a wet-lab moat." in Inter 500 at 72pt, slate
- Bottom: attribution line "BioKEA · Berkeley, California · 2026" in mono teal

This is a pure layout job — better done in Figma or Illustrator using existing assets than generated from scratch.

### Site integration

Hosted at `/press-kit.png` for direct journalist download; linked from the footer with a small "Press kit" link.

---

# Appendices

## A. Post-production workflows

**Universal steps for any generated asset:**

1. Open in Figma or Photoshop.
2. Verify palette against the hex values. Use a color picker. Reject if teal drifted to olive or cyan.
3. Typeset any text using Inter and JetBrains Mono from Google Fonts (or local `@fontsource` versions already in the repo).
4. Export to the target format.
5. Run the export through `exiftool -all=` or `magick -strip` to drop metadata.
6. Verify file size ≤ the listed ceiling.
7. Drop into `public/assets/images/` at the exact filename specified.

## B. File naming convention

- Hero illustrations: `BioKEA-<Thing>.webp` (existing pattern)
- Per-tile icons: `Pillar<N>-<Name>.webp` (existing pattern)
- Lockup variants: `Pillar<N>-<Name>-lockup.webp`
- Page-specific OG cards: `og-<page>.jpg`
- Specimen marginalia: `marg-<kind>.webp`
- Mockups: `<context>-mockup.webp`
- Maps: `<region>-map.webp`

## C. Site integration checklist (per-asset)

After saving a new asset to `public/assets/images/`:

1. Update the consuming component's `<img>` `src`, `width`, `height`, and `alt` attributes.
2. Update the consuming component's `<img>` `loading` attribute: `eager` if above-fold, `lazy` otherwise.
3. If the asset is LCP for its page, update `BaseLayout` `preloadImage` prop for that page.
4. Run `npm run check` to confirm no TypeScript errors.
5. Run `npm run test:e2e` to confirm no e2e regressions (image alt or dimension checks may fail).
6. Run `npm run build` followed by Lighthouse against preview to confirm perf didn't regress.
7. Commit with a descriptive message; update `docs/briefs/biokea-imagery-production-brief.md` if the brief itself needed adjustment.

## D. When to re-consult the LDC style guide

For anything related to:

- Exact palette values beyond the recap here
- Detailed what-to-avoid rules
- Per-tool prompt structure (Midjourney / DALL·E / SDXL template)
- Delivery format specifics

See `docs/briefs/biokea-ldc-style-guide.md` — it remains the canonical reference.

## E. Sign-off

Each delivered asset must pass:

- [ ] Palette check (teal dominant, ochre secondary, magenta only-if-earned)
- [ ] Line-quality check (flat, no glow, no gradient, no drop shadow)
- [ ] File size ≤ ceiling
- [ ] Dimensions exact
- [ ] Alt text drafted
- [ ] Site integration complete
- [ ] Tests green
- [ ] Lighthouse perf unchanged
