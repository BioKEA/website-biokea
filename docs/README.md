# docs

Source material, briefs, and planning records for the BioKEA website.

Nothing in this directory is shipped to the site — everything here is working material
that produced or informs what lives in `src/` and `public/`.

## Layout

| Path                       | Purpose                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive/`                 | Pre-Astro-migration artifacts (Next.js era). Kept for reference.                                                                                                                                                 |
| `briefs/`                  | Living internal briefs: LDC visual style guide, imagery production brief.                                                                                                                                        |
| `imagery-production-pack/` | The 13-asset cream-palette imagery pack as delivered (favicon set, contact sheet, per-asset source).                                                                                                             |
| `references/`              | External/source PDFs: AI-first bio-publishing deck, BioKEA capabilities deck, CIBI Ecography proof.                                                                                                              |
| `source/`                  | Raw inputs that were transformed into `public/assets/`: portrait originals, equipment screenshots, intertidal Shiny screenshots, LDC and pillar illustration master files, equipment inventory, moving-day HEIC. |
| `superpowers/`             | Superpowers planning artifacts (specs + plans) for the site overhaul.                                                                                                                                            |

## Conventions

- Kebab-case for new filenames where we rename.
- Original filenames preserved when they're already descriptive or when external provenance matters (PDF decks, official headshots).
- `source/` subdirectories group by what the asset _is_, not by where it ended up on the site.
- The full pre-migration Next.js source lives in git history — see `archive/README.md`.
