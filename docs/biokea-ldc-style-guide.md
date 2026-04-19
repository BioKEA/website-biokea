# BioKEA Large Data Collider — illustration revision brief

**Target file to replace:** `public/assets/images/BioKEA-Large-Data-Collider.webp`
**Where it appears:** homepage hero badge (inset to the right of the headline), lab page accents.
**Intrinsic dimensions:** 640×640, square
**Delivery format:** WebP (preferred) or PNG with transparent background; 640×640 minimum, 1024×1024 ideal for retina
**Output filename:** `BioKEA-Large-Data-Collider-cream.webp` (so the current file stays as a fallback until the swap is approved)

---

## 1. Why we're revising

The current illustration (dark navy background, neon cyan + yellow DNA helices meeting at a yellow starburst, sci-fi circuitry, the phrase "BIOKEA LARGE DATA COLLIDER" wrapping around a ring) reads as a "AI-tech-startup-game-HUD" — saturated neon, heavy glow, dark palette, high-contrast drama.

The rest of the site is **cream editorial**: a warm off-white background, teal structural accents, understated typography, a subtle blueprint grid, photographs of real lab equipment. The dark-neon LDC illustration fights that restraint — it pulls too much attention, the palette clashes, and the sci-fi drama undercuts the "serious public-interest science" tone.

We want an illustration that sits inside the cream editorial system without feeling like a compromise.

---

## 2. What to preserve

These conceptual elements make the image meaningful — do **not** drop them:

- **The collision metaphor.** Two strands of input (DNA double helices work well) converging on a central point of insight or "fusion." This is the defining concept of the _Collider._
- **Circular composition.** The visual frame is circular — think a large round "instrument window" or "aperture." The wordmark can wrap around this ring.
- **The wordmark text: "BIOKEA LARGE DATA COLLIDER"** — set in a clean sans-serif, wrapping around the outer ring, evenly spaced. Display font, not decorative.
- **Genomic / biological motifs.** DNA, barcoded sequence tick-marks, taxonomic nodes — something that says "biology data," not generic particle physics.
- **A sense of energy / convergence at the center.** Not a glowing starburst explosion, but a quieter focal point: a nexus of converging lines, or a small precise "hit" where inputs meet.

---

## 3. What to change

| Dimension          | Current                                     | Target                                                                                                                        |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Background         | Dark navy (#0a0e1a)                         | **Transparent** (preferred) or **cream `#F3EFE6`**                                                                            |
| Primary line color | Neon cyan (#00b7eb)                         | **Deep teal `#0f766e`**                                                                                                       |
| Accent color       | Saturated yellow (#fbbf24)                  | **Ochre `#92400e`**, or **dark ink `#0b1f1a`** for high-contrast details                                                      |
| Rare "live" signal | —                                           | **Magenta `#be185d`** — a single precise spark at the collision point, nothing else                                           |
| Line quality       | Neon glow, chunky strokes, halos            | Flat, precise, **draftsman / blueprint** line weight. Think technical illustration or scientific diagram, not video-game HUD. |
| Mood               | Sci-fi, dramatic, glowing                   | Confident, understated, editorial — calm authority                                                                            |
| Texture            | Vector-clean, no texture                    | Optional **subtle blueprint grid** underlay at 3–5% opacity slate lines (only if it reads intentional, not noisy)             |
| Shading            | Heavy drop-shadows, gradients, glow effects | Flat or minimally shaded. No drop-shadows. No color gradients at more than ~20% shift.                                        |

---

## 4. Target palette (exact)

Use only these colors, drawn from `src/styles/tokens.css`:

```
Cream (background)       #F3EFE6
Cream warm (alt)         #F6F2E9
Ink (high contrast)      #0b1f1a
Slate (body)             #475569
Teal (primary accent)    #0f766e
Teal bright (rare)       #5eead4
Ochre (warm accent)      #92400e
Magenta (signal only)    #be185d
Grid lines               rgba(30, 41, 59, 0.04)
```

Use **teal as the dominant hue.** Ochre secondary. Magenta is a _signal_ — it should appear at most once, at the collision nexus, and read as an intentional spark rather than decoration. Black `#0b1f1a` for the wordmark and any crisp detail work.

---

## 5. Reference for the overall style

The existing BioKEA deck `docs/AI_First_Bio_Publishing.pdf` (v2026.01) is the **target visual language**. Every slide in that deck already lives in the aesthetic we want: cream paper, muted jewel tones, blueprint-isometric backgrounds, flat illustrations, editorial typography. Study it before generating.

In particular:

- **Slide 1** (title) — the LUCA tree diagram + network graph on cream. Compositionally similar to what we want for the LDC.
- **Slide 4** ("Stage 2: The BioKEA Large Data Collider") — shows a funnel-and-collision illustration in the target style.
- **Slide 10** ("Connecting the Dots: The Agentis Knowledge Graph") — shows graph-node illustration in the target palette.

Also usable as live references:

- Anthropic blog hero illustrations (cream + muted, flat editorial)
- NotebookLM marketing art (where this deck came from)
- Linear.app documentation illustrations (cream + geometric precision)

---

## 6. Prompt guidance by tool

### Midjourney (v6+ or v7)

```
Editorial scientific illustration, circular composition, two DNA double helices
converging at a central collision point, surrounded by a thin ring bearing the
text "BIOKEA LARGE DATA COLLIDER" in clean sans-serif. Flat draftsman style,
deep teal #0f766e line work, ochre #92400e secondary accents, single magenta
#be185d spark only at the convergence point, cream #F3EFE6 paper background.
Subtle blueprint grid at 3% opacity. Precise technical line weight. No glow,
no gradients, no drop shadows. Calm, understated, editorial — reminiscent of
NotebookLM illustrations. --ar 1:1 --style raw --v 7 --s 50
```

Weighting: low stylize (`--s 25` to `--s 75`) to stay literal. If text rendering fails on the ring, generate without text and add the wordmark in post (Figma / Illustrator).

### DALL·E 3 (ChatGPT / API)

```
A square editorial scientific illustration on a cream #F3EFE6 background,
designed in a flat draftsman style (no glow, no gradients, no drop shadows).
Two DNA double helices enter from the left and right and converge at a small
central collision point marked with a single magenta #be185d spark. The composition
is framed by a thin circular ring. On that ring, set in clean sans-serif
capitals evenly spaced around the perimeter, is the text "BIOKEA LARGE DATA COLLIDER".
Line work is deep teal #0f766e with ochre #92400e accents for sequence tick-marks
and taxonomic nodes. Optional subtle 3% opacity blueprint grid underlay. Calm,
understated, editorial tone — reminiscent of NotebookLM or Linear.app illustrations.
1024x1024.
```

Known DALL·E failure mode: text on circular paths often garbles. Generate with a plain horizontal placeholder of the wordmark across the top and move it to the ring in post-processing.

### Stable Diffusion XL / Flux

Positive:

```
flat editorial scientific illustration, circular composition, DNA double helix
converging to a central nexus, thin ring containing text "BIOKEA LARGE DATA COLLIDER",
deep teal #0f766e line work, ochre #92400e accents, single magenta #be185d spark
at center, cream #F3EFE6 background, subtle blueprint grid underlay, draftsman
technical illustration, NotebookLM-style editorial art, Linear.app illustration
```

Negative:

```
neon, glow, bloom, dark background, navy, cyan, saturated yellow, sci-fi HUD,
game interface, 3D render, drop shadow, heavy gradient, explosion, sparks,
photoreal, lens flare, cartoon mascot, lowres, blurry, watermark, signature
```

CFG 4–6, 30–50 steps, SDXL base with Juggernaut / Flux-dev for editorial style.

---

## 7. What to explicitly avoid

- **Dark backgrounds** — nothing darker than cream at this point.
- **Neon or glow effects** — no halos, no outer glows, no bloom.
- **Saturated primary cyan** — pull all blues toward deep teal `#0f766e`.
- **Saturated primary yellow** — replace with ochre `#92400e`.
- **Drop shadows** — flat illustration only.
- **Gradient fills** — solid colors; if a gradient is unavoidable keep delta small.
- **3D rendering / isometric depth** — flat paper-editorial only.
- **Starburst / explosion at center** — the "collision" should read as a quiet nexus, not a detonation.
- **Extra illustrative ornament** — no random circuit traces filling dead space. Restraint is the aesthetic.
- **Mascot characters** — the BioKEA robot-DNA mascot (`logo2.png`) lives in a different context. Do not include it in this illustration.

---

## 8. Composition anchors

- **Aspect:** 1:1 square. 640×640 minimum, 1024×1024 or 2048×2048 preferred so we can downscale crisply.
- **Safe area:** leave at least 8% margin from every edge. The image appears with a soft drop-shadow on the homepage, so edge-tight details will be cropped visually.
- **Center mass:** the collision point sits at geometric center. Visual weight is balanced left/right.
- **Ring text:** set at 100% capital, modest tracking, teal on cream. If the generator can't render text cleanly, supply the composition without text and we'll typeset the wordmark in Figma/Illustrator on top.

---

## 9. Delivery

Requirements:

- **Format:** WebP, quality 82–85 (PNG acceptable if WebP export is not available)
- **Size:** ≤ 80 KB at 640×640 render size; higher-res source acceptable
- **Background:** transparent preferred; solid cream `#F3EFE6` acceptable
- **Color space:** sRGB
- **Bit depth:** 8-bit per channel

---

## 10. Same treatment for the 3 pillar illustrations

The same palette, line-quality, and "no neon, no glow, no gradient" rules apply to the three surviving pillar illustrations:

- `public/assets/images/Pillar1-BioinfoOS.webp`
- `public/assets/images/Pillar2-Agentis.webp`
- `public/assets/images/Pillar3-Droplet.webp`

Each is a square badge representing one of the BioKEA product lines. Use this same brief as the template, substituting the motif:

- **Droplet** — Droplet is an **aquatic eDNA and metabarcoding specialist**: field water sample collection through species-level taxonomic identification. Illustration: a water droplet containing a DNA helix and subtle sequence tick-marks, optionally with a fine wave or ripple line around the base to nod at the aquatic context. Teal line work on cream. Ochre highlight on the droplet rim. A single magenta spark inside the helix loop is optional. Optional secondary motif: a small silhouetted aquatic organism (e.g., a fish or daphnia) inside or beside the droplet, suggesting the taxonomic-identification deliverable.
- **BioinfoOS** — a spiral or galaxy of taxonomic nodes with a small instrument icon at its heart. Teal dominant. The core is the "eye" of the spiral.
- **Agentis** — a quill and an open book, with a subtle handshake motif (human + AI) between them. Teal and ochre. Understated scholarly tone.

Deliver as:

- `public/assets/images/Pillar1-BioinfoOS-cream.webp`
- `public/assets/images/Pillar2-Agentis-cream.webp`
- `public/assets/images/Pillar3-Droplet-cream.webp`
