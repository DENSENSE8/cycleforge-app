/**
 * SoT-by-job retrieval CLI (DS fork-consolidation program — Phase 1 slice 1c).
 *
 * Discovery-before-build: ask "what is the SoT for job X?" and get the module +
 * path + guard + the rule wording that governs it — BEFORE composing a chrome /
 * table / right-edge / card / KPI surface, so the surface is composed from the
 * SoT instead of re-forked beside it.
 *
 * Reads the published catalog `sot-manifest.json` (parity-guarded); rebuilds
 * fresh only if it is missing. Ranking lives in `build-sot-manifest.mjs`.
 *
 * Usage:
 *   node scripts/sot-lookup.mjs "check button chrome"      # ranked results
 *   node scripts/sot-lookup.mjs -n 12 "kpi band"            # top N (default 8)
 *   node scripts/sot-lookup.mjs --json "right rail header"  # machine-readable
 *   node scripts/sot-lookup.mjs --stats                     # catalog summary
 */

import { readFileSync, existsSync } from 'node:fs';
import { buildSotManifest, searchManifest, serializeManifest, MANIFEST_PATH } from './build-sot-manifest.mjs';

function loadManifest() {
  if (existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      /* fall through to a fresh build */
    }
  }
  return JSON.parse(serializeManifest(buildSotManifest()));
}

function printHuman(hits, query) {
  if (hits.length === 0) {
    process.stdout.write(
      `No SoT indexed for "${query}".\n` +
        'Try a different phrasing (job name, symbol, or module), or the SoT may not be documented yet.\n' +
        'Do NOT fork a page-local twin — compose the nearest SoT, or grow it (pattern-evolution.md).\n',
    );
    return;
  }
  process.stdout.write(`SoT for "${query}" — top ${hits.length}:\n\n`);
  for (const h of hits) {
    const bits = [];
    if (h.path) bits.push(`path: ${h.path}`);
    if (h.guard) bits.push(`guard: ${h.guard}`);
    if (h.symbols && h.symbols.length) bits.push(`symbols: ${h.symbols.slice(0, 6).join(', ')}`);
    process.stdout.write(`■ ${h.job}\n`);
    process.stdout.write(`  SoT: ${h.sot}\n`);
    if (bits.length) process.stdout.write(`  ${bits.join('  ·  ')}\n`);
    process.stdout.write(`  rule: ${h.source}:${h.line}\n`);
    if (h.snippet) process.stdout.write(`  ${h.snippet}\n`);
    process.stdout.write('\n');
  }
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes('--json');
  const stats = args.includes('--stats');
  let limit = 8;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json' || a === '--stats') continue;
    if (a === '-n' || a === '--limit') {
      limit = Math.max(1, parseInt(args[++i], 10) || 8);
      continue;
    }
    rest.push(a);
  }
  const manifest = loadManifest();

  if (stats) {
    const withPath = manifest.entries.filter((e) => e.path).length;
    const withGuard = manifest.entries.filter((e) => e.guard).length;
    process.stdout.write(
      `sot-manifest.json — ${manifest.count} SoT entries · ${withPath} with a path · ${withGuard} with a guard · ${manifest.sources.length} rule files.\n` +
        `Regenerate: ${manifest.regenerate}\n`,
    );
    return 0;
  }

  const query = rest.join(' ').trim();
  if (!query) {
    process.stderr.write(
      'Usage: node scripts/sot-lookup.mjs [--json] [-n N] "<job or symbol>"\n' +
        '       node scripts/sot-lookup.mjs --stats\n',
    );
    return 2;
  }
  const hits = searchManifest(manifest, query, limit);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ query, hits }, null, 2)}\n`);
  } else {
    printHuman(hits, query);
  }
  return 0;
}

// Set exitCode (not process.exit) so piped stdout fully drains before exit.
process.exitCode = main(process.argv);
