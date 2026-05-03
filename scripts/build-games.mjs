#!/usr/bin/env node
// scripts/build-games.mjs
//
// Path 1: clones each game's GitHub repo, builds it with vite, and writes
// the dist output into public/mission/games/<slug>/. Runs as a prebuild
// step on biokea.ai's build so games stay sourced from per-game repos but
// served from the marketing-site domain at /mission/games/<slug>/ — nested
// under Mission to reinforce the storytelling thesis.
//
// Auth: reads GITHUB_TOKEN from env. For local dev, falls back to
// `gh auth token` if available. If neither is set, the script logs a
// warning and exits 0 — the pre-bundled artifact under
// public/mission/games/<slug>/ continues to serve.
//
// Failures per-game are non-fatal: a network blip or a broken upstream
// will keep the bundled fallback in place rather than tearing down the
// whole biokea.ai deploy.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Read slug+repo pairs from src/data/games.ts so this script and the
// website never drift. Regex finds each `{ slug: '…', …, repo: '…' }`
// pair; entries without a repo field are skipped (and continue to serve
// from the bundled artifact under public/games/<slug>/, if present).
function readGames() {
  const src = readFileSync(join(root, 'src', 'data', 'games.ts'), 'utf-8');
  const re = /\{[^{}]*?slug:\s*['"]([^'"]+)['"][^{}]*?repo:\s*['"]([^'"]+)['"]/gs;
  const games = [];
  for (const m of src.matchAll(re)) games.push({ slug: m[1], repo: m[2] });
  return games;
}
const games = readGames();

// Slugs whose builds should ship with real Supabase credentials so the
// shared @biokea/leaderboard client can submit + read scores. The other
// games build with stubs and silently no-op (createClient throws on an
// empty URL, hence why we still set *something*).
const LEADERBOARD_ENABLED = new Set([
  'codon2048',
  'pipette-rush',
  'plasmid-plinko',
  'particle-survival-shooter',
]);

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseSecrets = !!(supabaseUrl && supabasePublishableKey);

const stubEnv = {
  VITE_SUPABASE_URL: 'https://stub.invalid',
  VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'stub-anon-key',
};

const liveEnv = hasSupabaseSecrets
  ? {
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: supabasePublishableKey,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    }
  : null;

function envForGame(slug) {
  if (LEADERBOARD_ENABLED.has(slug) && liveEnv) return liveEnv;
  return stubEnv;
}

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
    '[games-build] No GITHUB_TOKEN and no gh auth — skipping clones. /mission/games/<slug>/ routes will 404 unless public/mission/games/ already populated locally.',
  );
  process.exit(0);
}

// Tokenize all github.com HTTPS URLs for the duration of this build, so
// `npm install` inside each game can also clone its private deps (notably
// @biokea/leaderboard pulled via `github:BioKEA/biokea-leaderboard-js#main`).
// We write a build-local gitconfig and point HOME at it so we don't pollute
// the user's global config in local dev.
const tmpHome = mkdtempSync(join(tmpdir(), 'games-build-home-'));
writeFileSync(
  join(tmpHome, '.gitconfig'),
  // - url.insteadOf rewrites all https://github.com/ to include our token
  // - credential.helper is set to "" to disable any inherited helper
  //   (macOS osxkeychain triggers a "Keychain not Found" prompt during
  //   builds; we don't need it because the token is in the rewritten URL).
  // - core.askpass=true with GIT_TERMINAL_PROMPT=0 ensures no interactive
  //   credential prompts under any circumstance.
  `[url "https://x-access-token:${token}@github.com/"]\n` +
    `\tinsteadOf = https://github.com/\n` +
    `[credential]\n` +
    `\thelper =\n`,
);
const gitEnv = {
  ...process.env,
  HOME: tmpHome,
  GIT_TERMINAL_PROMPT: '0',
};

let okCount = 0;
let failCount = 0;

for (const game of games) {
  const work = join(tmpdir(), `games-build-${game.slug}-${process.pid}-${Date.now()}`);
  const buildEnv = envForGame(game.slug);
  const leaderboardLive = buildEnv === liveEnv;
  console.log(
    `\n[games-build] ${game.slug}: ${game.repo}${leaderboardLive ? ' [leaderboard: live]' : ''}`,
  );
  try {
    mkdirSync(work, { recursive: true });
    run(`git clone --depth 1 https://github.com/${game.repo}.git ${work}`, { env: gitEnv });
    run('npm install --no-audit --no-fund --no-progress', {
      cwd: work,
      env: { ...gitEnv, ...buildEnv },
    });
    run(`npx vite build --base /mission/games/${game.slug}/`, {
      cwd: work,
      env: { ...gitEnv, ...buildEnv },
    });
    const out = join(root, 'public', 'mission', 'games', game.slug);
    rmSync(out, { recursive: true, force: true });
    cpSync(join(work, 'dist'), out, { recursive: true });
    console.log(`[games-build] ${game.slug}: ✓ built from ${game.repo}`);
    okCount++;
  } catch (err) {
    console.error(`[games-build] ${game.slug}: ✗ failed — ${err?.message ?? err}`);
    console.error(`[games-build] ${game.slug}: bundled fallback under public/mission/games/${game.slug}/ remains in place.`);
    failCount++;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Clean up the build-local gitconfig (token-bearing) before exit.
rmSync(tmpHome, { recursive: true, force: true });

console.log(`\n[games-build] done. ${okCount} ok · ${failCount} failed`);
// Always exit 0; we don't want one upstream blip to nuke the marketing-site deploy.
process.exit(0);
