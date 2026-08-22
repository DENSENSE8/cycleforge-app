#!/usr/bin/env node
/**
 * Per-route JS budget ratchet — the cheap half of the performance gate.
 *
 * Lighthouse needs a production server, a browser and ~30-60 min for the whole
 * manifest, so it cannot run on every commit. Payload weight is the input to
 * most of what Lighthouse then measures, it is deterministic, and it falls out
 * of a build we already do — so it is the part worth gating continuously.
 *
 * Source of truth is Next's own build table ("First Load JS" per route) rather
 * than `.next/app-build-manifest.json`: this repo builds with Turbopack, which
 * does not emit that manifest. The printed table is bundler-agnostic.
 *
 *   next build 2>&1 | tee build.log
 *   node scripts/bundle-budget.mjs --log build.log            # check (ratchet)
 *   node scripts/bundle-budget.mjs --log build.log --update   # re-seed budgets
 *   node scripts/bundle-budget.mjs --log build.log --report   # print, never fail
 *
 * Budgets live in `bundle-budget.json`. Like the Lighthouse baseline, floors
 * only move DOWN — finishing an optimization tightens the budget so the win
 * cannot be silently spent again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const budgetPath = path.join(repoRoot, 'bundle-budget.json');

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined;
};
const update = Boolean(flag('update'));
const report = Boolean(flag('report'));
const logArg = flag('log');

/** kB / MB / B -> kilobytes, so one unit is comparable across the table. */
export function toKb(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const u = String(unit).toLowerCase();
  if (u === 'mb') return n * 1024;
  if (u === 'kb') return n;
  if (u === 'b') return n / 1024;
  return null;
}

/**
 * Parse the route table out of a `next build` log.
 *
 * Rows look like (tree glyphs and the leading route-type symbol vary):
 *   ┌ ○ /                          1.2 kB    100 kB
 *   ├ ƒ /dashboard                  45 kB    520 kB
 * The LAST size column is First Load JS; the first is the route's own chunk.
 * Rows without two size columns (route groups, the shared-chunks footer) are
 * skipped rather than guessed at.
 */
export function parseBuildLog(text) {
  const routes = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\[[0-9;]*m/g, ''); // strip ANSI colour
    // must start with a tree glyph or whitespace, then a route-type symbol, then /path
    const m = line.match(
      /^[\s│├└┌┬─+|`\\-]*[○●ƒλ◐○●]?\s*(\/[^\s]*)\s+([\d.]+)\s*(B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)\s*$/i,
    );
    if (!m) continue;
    const [, route, , , firstLoad, firstUnit] = m;
    const kb = toKb(firstLoad, firstUnit);
    if (kb == null) continue;
    // Route handlers ship no client bundle — they report 0 B and would only add
    // ~200 rows of noise to a payload budget.
    if (route.startsWith('/api/') || kb === 0) continue;
    // dynamic segments collapse to their template, which is what the budget keys on
    routes[route] = Math.round(kb * 10) / 10;
  }
  return routes;
}

function readLog() {
  if (typeof logArg === 'string') {
    if (!fs.existsSync(logArg)) {
      console.error(`No build log at ${logArg}`);
      process.exit(1);
    }
    return fs.readFileSync(logArg, 'utf8');
  }
  if (process.stdin.isTTY) {
    console.error('Pass --log <file>, or pipe a `next build` log on stdin.');
    process.exit(1);
  }
  return fs.readFileSync(0, 'utf8');
}

function main() {
  const measured = parseBuildLog(readLog());
  const count = Object.keys(measured).length;
  if (count === 0) {
    console.error(
      'No route rows parsed from the build log. Did the build fail, or did the table format change?',
    );
    process.exit(1);
  }

  const existing = fs.existsSync(budgetPath)
    ? JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
    : { tolerancePct: 5, routes: {} };

  if (update) {
    for (const [route, kb] of Object.entries(measured)) {
      const prev = existing.routes[route]?.maxKb;
      // floors only move down — a regression must be fixed, not re-baselined
      existing.routes[route] = { maxKb: prev == null ? kb : Math.min(prev, kb) };
    }
    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(budgetPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`Wrote ${path.relative(repoRoot, budgetPath)} (${count} routes).`);
    return;
  }

  const tol = existing.tolerancePct ?? 5;
  const rows = [];
  let failed = false;
  for (const [route, kb] of Object.entries(measured).sort((a, b) => b[1] - a[1])) {
    const max = existing.routes?.[route]?.maxKb;
    if (max == null) {
      rows.push(`  NEW      ${route} — ${kb} kB (no budget yet)`);
      continue;
    }
    const ceiling = max * (1 + tol / 100);
    if (kb > ceiling) {
      rows.push(`  OVER     ${route} — ${kb} kB > ${max} kB +${tol}%`);
      failed = true;
    } else if (kb < max) {
      rows.push(`  IMPROVED ${route} — ${kb} kB (budget ${max} kB — re-seed to lock it in)`);
    }
  }

  console.log(`Bundle budget — ${count} routes measured, tolerance +${tol}%`);
  for (const r of rows.slice(0, 40)) console.log(r);
  if (rows.length > 40) console.log(`  … ${rows.length - 40} more`);

  if (failed && !report) {
    console.error('\nBundle budget FAILED — a route grew past its ceiling.');
    process.exit(1);
  }
  console.log(failed ? '\nOver budget (report mode — not failing).' : '\nBundle budget OK.');
}

// only run when invoked directly, so the parser stays unit-testable
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
