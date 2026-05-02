#!/usr/bin/env node
// scripts/build-games.mjs
//
// Path 1: clones each game's GitHub repo, builds it with vite, and writes
// the dist output into public/games/<slug>/. Runs as a prebuild step on
// biokea.ai's build so games stay sourced from per-game repos but served
// from the marketing-site domain.
//
// Auth: reads GITHUB_TOKEN from env. For local dev, falls back to
// `gh auth token` if available. If neither is set, the script logs a
// warning and exits 0 — the pre-bundled artifact under public/games/<slug>/
// continues to serve.
//
// Failures per-game are non-fatal: a network blip or a broken upstream
// will keep the bundled fallback in place rather than tearing down the
// whole biokea.ai deploy.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Source-of-truth for what to build from upstream. Add an entry here when a
// game gets its own GitHub repo. Until then, the slug's pre-bundled artifact
// in public/games/<slug>/ continues to serve.
const games = [
  {
    slug: 'codon2048',
    repo: 'BioKEA/game-codon2048',
  },
];

const stubEnv = {
  // Games crash at import time if Supabase env is empty (createClient throws
  // on empty URL). Stub these so builds succeed; leaderboards silently no-op
  // against an unreachable host.
  VITE_SUPABASE_URL: 'https://stub.invalid',
  VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'stub-anon-key',
};

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

const token = getToken();
if (!token) {
  console.warn(
    '[games-build] No GITHUB_TOKEN and no gh auth — skipping clones. Bundled artifacts under public/games/<slug>/ will serve as-is.',
  );
  process.exit(0);
}

let okCount = 0;
let failCount = 0;

for (const game of games) {
  const work = join(tmpdir(), `games-build-${game.slug}-${process.pid}-${Date.now()}`);
  console.log(`\n[games-build] ${game.slug}: ${game.repo}`);
  try {
    mkdirSync(work, { recursive: true });
    run(
      `git clone --depth 1 https://x-access-token:${token}@github.com/${game.repo}.git ${work}`,
    );
    run('npm install --no-audit --no-fund --no-progress', {
      cwd: work,
      env: { ...process.env, ...stubEnv },
    });
    run(`npx vite build --base /games/${game.slug}/`, {
      cwd: work,
      env: { ...process.env, ...stubEnv },
    });
    const out = join(root, 'public', 'games', game.slug);
    rmSync(out, { recursive: true, force: true });
    cpSync(join(work, 'dist'), out, { recursive: true });
    console.log(`[games-build] ${game.slug}: ✓ built from ${game.repo}`);
    okCount++;
  } catch (err) {
    console.error(`[games-build] ${game.slug}: ✗ failed — ${err?.message ?? err}`);
    console.error(`[games-build] ${game.slug}: bundled fallback under public/games/${game.slug}/ remains in place.`);
    failCount++;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log(`\n[games-build] done. ${okCount} ok · ${failCount} failed (fallback in use)`);
// Always exit 0; we don't want one upstream blip to nuke the marketing-site deploy.
process.exit(0);
