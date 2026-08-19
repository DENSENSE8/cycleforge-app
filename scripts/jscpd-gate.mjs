#!/usr/bin/env node
/**
 * jscpd shrink-only clone baseline (DS fork-consolidation Phase 1b / D5).
 *
 * Existing near-duplicates are parked in `jscpd-baseline.json`. A new clone
 * that raises `clones` fails. `duplicatedLines` is informational — jscpd's
 * line accounting jitters run-to-run and is not a hard ratchet. The curated
 * ignore set lives in `.jscpd.json` (cell registries, *-grid-layout.ts,
 * header factory configs, DataTable + admin, C2 station-vs-desk shells). Pairwise floor-vs-desk
 * clones (station vs support) are filtered via `hardware-wall.mjs` — a glob
 * cannot express "A vs B" without also silencing clones inside each tree.
 *
 *   node scripts/jscpd-gate.mjs           # compare against baseline
 *   node scripts/jscpd-gate.mjs --write   # rewrite the baseline (shrink only)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterHardwareWallClones, tallyDuplicates } from './hardware-wall.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'jscpd-baseline.json');
const REPORT_DIR = join(ROOT, 'reports', 'jscpd');
const REPORT = join(REPORT_DIR, 'jscpd-report.json');
const CACHE_DIR = join(ROOT, '.jscpd');
const WRITE = process.argv.includes('--write');
// Run the INSTALLED jscpd, never `npx jscpd`. In a checkout with no
// node_modules, npx silently fetches jscpd@latest — a different major, whose
// flags (`--noTips` was renamed `--no-tips` in 5.x) and clone accounting do not
// match `jscpd-baseline.json`. That reads as a breached baseline, or an
// unexplained exit 2, when nothing in `src` changed. Spawning the package's own
// entry through `process.execPath` also drops the `shell: win32` hack: no .cmd
// resolution, and no quoting hazard if the checkout path contains spaces.
const JSCPD_ENTRY = join(ROOT, 'node_modules', 'jscpd', 'bin', 'jscpd');

if (!existsSync(JSCPD_ENTRY)) {
  process.stderr.write(
    `jscpd-gate: jscpd is not installed at ${JSCPD_ENTRY}.\n` +
      'Run `npm install` in THIS checkout, then re-run the gate.\n' +
      'The gate deliberately does not fall back to `npx jscpd` — that would pull a\n' +
      'different major and compare its clone count against a baseline recorded here.\n',
  );
  process.exit(2);
}

rmSync(REPORT_DIR, { recursive: true, force: true });
mkdirSync(REPORT_DIR, { recursive: true });
// Stale LevelDB cache lists deleted files (e.g. the gate's clone-probe) and
// then ENOENT-crashes. Wipe like knip-gate does for its cache.
rmSync(CACHE_DIR, { recursive: true, force: true });
rmSync(join(ROOT, 'node_modules', '.cache', 'jscpd'), { recursive: true, force: true });

const res = spawnSync(
  process.execPath,
  [
    JSCPD_ENTRY,
    'src',
    '--config',
    '.jscpd.json',
    '--reporters',
    'json',
    '--output',
    REPORT_DIR,
    '--silent',
    '--noTips',
    '--exitCode',
    '0',
  ],
  { cwd: ROOT, encoding: 'utf8' },
);

if (res.status !== 0 && res.status !== null) {
  process.stderr.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  process.stderr.write(`jscpd-gate: jscpd exited ${res.status}\n`);
  process.exit(res.status ?? 1);
}

if (!existsSync(REPORT)) {
  process.stderr.write(`jscpd-gate: missing report at ${REPORT}\n`);
  process.stderr.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  process.exit(2);
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const statistics = report.statistics ?? report;
const total = statistics.total ?? statistics;
const hasDupes = Array.isArray(report.duplicates);
const kept = filterHardwareWallClones(hasDupes ? report.duplicates : []);
const tallied = tallyDuplicates(kept);
const live = {
  clones: hasDupes ? tallied.clones : Number(total.clones ?? total.duplications ?? 0),
  duplicatedLines: hasDupes
    ? tallied.duplicatedLines
    : Number(total.duplicatedLines ?? total.duplicatedLinesTotal ?? 0),
  percentage: Number(total.percentage ?? 0),
};

if (!existsSync(BASELINE)) {
  if (!WRITE) {
    process.stderr.write('jscpd-gate: no jscpd-baseline.json — run with --write to seed.\n');
    process.exit(2);
  }
  writeFileSync(BASELINE, `${JSON.stringify(live, null, 2)}\n`);
  process.stdout.write(`jscpd-gate: seeded baseline clones=${live.clones} duplicatedLines=${live.duplicatedLines}\n`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const grew = live.clones > Number(baseline.clones);

if (grew) {
  process.stderr.write(
    `jscpd-gate: clones grew (live clones=${live.clones} lines=${live.duplicatedLines}` +
      ` vs baseline clones=${baseline.clones} lines=${baseline.duplicatedLines}).\n` +
      `A new same-usecase clone landed inside an interaction contract.\n` +
      `Compose the existing SoT. Do not merge station assemblies with support/desk assemblies.\n`,
  );
  process.exit(1);
}

if (WRITE) {
  if (live.clones < Number(baseline.clones)) {
    writeFileSync(BASELINE, `${JSON.stringify(live, null, 2)}\n`);
    process.stdout.write(
      `jscpd-gate: baseline shrunk clones ${baseline.clones}→${live.clones} ` +
        `lines ${baseline.duplicatedLines}→${live.duplicatedLines}\n`,
    );
  } else {
    process.stdout.write(
      `jscpd-gate: unchanged clones=${live.clones} (duplicatedLines=${live.duplicatedLines} is informational).\n`,
    );
  }
  process.exit(0);
}

process.stdout.write(
  `jscpd-gate: ok clones=${live.clones} (≤${baseline.clones}) ` +
    `duplicatedLines=${live.duplicatedLines}\n`,
);
