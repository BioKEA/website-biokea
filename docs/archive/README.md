# archive

Pre-Astro-migration artifacts. Kept intentionally so the prior state of the project is
browsable alongside its current form.

## In this directory

- `ROADMAP-nextjs-era.md` — the Next.js-era roadmap (written February 2026 before the
  Astro migration). Most items have been superseded. Retained for historical context.

## Where the old Next.js source lives

The full pre-migration Next.js codebase is preserved in **git history**, not on disk.
Two durable pointers:

1. **Branch `backup-pre-cleanup-20260204`** — a snapshot of the repo immediately
   before the cleanup/migration work began. Local and on `origin`.

   ```bash
   git checkout backup-pre-cleanup-20260204
   ```

2. **Commits around the migration:**
   - `94c56e1 chore: move Next.js source to old/ pending full removal in Phase 11`
     — the last commit where `old/` (containing the full Next.js source) existed in
     the working tree.
   - `955f005 chore: remove Next.js artifacts and update .gitignore` — the commit
     that took the Next.js source out of the tree entirely.

   To browse the Next.js source at its final tracked state:

   ```bash
   git show 94c56e1 --stat       # see what was in old/
   git checkout 94c56e1 -- old/  # restore old/ into the working tree (don't commit)
   ```

3. **Remote branches of note** on `origin`:
   - `backup-pre-cleanup-20260204` — same as the local branch above
   - `blue-yellow` — early styling experiment
   - `update_worker_name_to_biokeawebsite` — pre-migration Cloudflare Workers config change

Nothing in this archive should be edited. If an item needs to be revived, move it out
of `archive/` and into the appropriate live directory with a fresh commit.
