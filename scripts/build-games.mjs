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
  'cal-field-lab-collectible',
  '3d-biodiversity-collect-em-all',
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

// Injected into every game's index.html so players can escape back to the
// games index without us having to ship the same change to six repos. We
// intentionally inline all styling so the button works no matter how the
// game's own CSS is structured (some games reset everything; some don't).
const BACK_BUTTON_HTML = `<a href="/mission/games/" id="biokea-back" aria-label="Back to all BioKEA games" style="position:fixed;top:12px;left:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:9999px;background:rgba(15,23,42,0.78);color:#f8fafc;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 2px 8px rgba(0,0,0,0.18);transition:background 0.15s ease;line-height:1;" onmouseover="this.style.background='rgba(15,23,42,0.94)'" onmouseout="this.style.background='rgba(15,23,42,0.78)'"><span style="font-size:14px;line-height:1;">&larr;</span><span>All Games</span></a>`;

function injectBackButton(indexHtmlPath) {
  let html;
  try {
    html = readFileSync(indexHtmlPath, 'utf-8');
  } catch {
    // Some games may not have a top-level index.html (unlikely with Vite,
    // but treat as non-fatal); fall through and continue the build.
    return false;
  }
  // Match the opening <body> tag — possibly with attributes — and append
  // the back-button HTML right after it. Idempotent: if a previous run
  // already injected the marker, skip.
  if (html.includes('id="biokea-back"')) return true;
  const next = html.replace(/<body([^>]*)>/i, (match, attrs) => `<body${attrs}>${BACK_BUTTON_HTML}`);
  if (next === html) return false;
  writeFileSync(indexHtmlPath, next);
  return true;
}

// Bottom-right counterpart to the back button: opens the lab-updates
// subscribe page, with the game slug threaded through as ?source so
// we can attribute conversions per-game. Same styling vocabulary as
// the back button (dark pill, inline CSS, max z-index, idempotent).
function subscribeLinkHtml(slug) {
  const href = `/subscribe?source=${encodeURIComponent(slug)}`;
  return `<a href="${href}" id="biokea-subscribe" aria-label="Get BioKEA lab updates" style="position:fixed;bottom:12px;right:12px;z-index:2147483647;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:9999px;background:rgba(15,23,42,0.78);color:#f8fafc;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 2px 8px rgba(0,0,0,0.18);transition:background 0.15s ease;line-height:1;" onmouseover="this.style.background='rgba(15,23,42,0.94)'" onmouseout="this.style.background='rgba(15,23,42,0.78)'"><span>Lab updates</span><span style="font-size:14px;line-height:1;">&rarr;</span></a>`;
}

function injectSubscribeLink(indexHtmlPath, slug) {
  let html;
  try {
    html = readFileSync(indexHtmlPath, 'utf-8');
  } catch {
    return false;
  }
  if (html.includes('id="biokea-subscribe"')) return true;
  const linkHtml = subscribeLinkHtml(slug);
  const next = html.replace(/<body([^>]*)>/i, (match, attrs) => `<body${attrs}>${linkHtml}`);
  if (next === html) return false;
  writeFileSync(indexHtmlPath, next);
  return true;
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
    const indexHtml = join(out, 'index.html');
    injectBackButton(indexHtml);
    injectSubscribeLink(indexHtml, game.slug);
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
