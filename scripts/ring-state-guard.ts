/**
 * CLI face of the RING-STATE LAW: a list item's selected / open / active /
 * current state is painted as geometry (an overlay `STATE_OUTLINE_CLASS`
 * span), never as a Tailwind `ring-*` box-shadow a scroll container clips.
 *
 * The rule lives in `src/lib/design/ring-state-law.ts`; this script only
 * gathers the file-system facts (source text, baseline). `always` gate: a
 * line-based source read (<1s), and the increment that breaks it — painting a
 * new card's selection with `ring-*` — is exactly a `verify:fast` increment.
 *
 * Usage:
 *   tsx scripts/ring-state-guard.ts                    # check, text
 *   tsx scripts/ring-state-guard.ts --json             # check, { ok, findings, law }
 *   tsx scripts/ring-state-guard.ts --write-baseline   # rewrite the shrink-only baseline
 *
 * Exit 0 = the law holds against the baseline. Exit 1 = new hits, listed.
 * Exit 2 = the guard itself broke, which is never a verdict.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import {
  auditRingStateSource,
  compareRingStateBaseline,
  countRingStateHits,
  formatRingStateHit,
  RING_STATE_LAW,
  type RingStateBaseline,
  type RingStateHit,
} from '../src/lib/design/ring-state-law';

const REPO = path.resolve(__dirname, '..');
const BASELINE = 'scripts/ring-state.baseline.json';
const argv = process.argv.slice(2);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

try {
  const hits: RingStateHit[] = [];
  for (const full of walk(path.join(REPO, 'src'))) {
    const file = path.relative(REPO, full).split(path.sep).join('/');
    hits.push(...auditRingStateSource(file, readFileSync(full, 'utf8')));
  }

  if (argv.includes('--write-baseline')) {
    const counts = countRingStateHits(hits);
    const files = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(
      path.join(REPO, BASELINE),
      `${JSON.stringify(
        {
          note: 'FROZEN BASELINE — lines painting a STATE outline (selected/open/active/current) with Tailwind ring-*. SHRINK-ONLY: paint state as geometry (STATE_OUTLINE_CLASS overlay, src/design-system/components/record-card/record-card-outline.ts). Rewrite with `tsx scripts/ring-state-guard.ts --write-baseline`.',
          files,
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`ring-state-guard: baseline written — ${Object.keys(files).length} file(s), ${hits.length} hit(s), ${BASELINE}.\n`);
  }

  const baselinePath = path.join(REPO, BASELINE);
  const baseline: RingStateBaseline = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as RingStateBaseline)
    : { files: {} };
  const findings = compareRingStateBaseline(hits, baseline);
  const errors = findings.filter((f) => f.severity === 'error');

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, findings, law: RING_STATE_LAW }, null, 2)}\n`);
  } else if (findings.length === 0) {
    process.stdout.write(
      `ring-state-guard: no new ring state outlines (${hits.length} baselined across ${Object.keys(baseline.files).length} file(s)).\n`,
    );
  } else {
    const lines = findings.map((f) =>
      f.severity === 'error'
        ? `  ✗ ${f.file}: ${f.message}\n${f.hits.map((h) => `      ${formatRingStateHit(h)}`).join('\n')}`
        : `  ! ${f.file}: ${f.message}`,
    );
    process.stdout.write(
      `ring-state-guard: ${errors.length} error(s), ${findings.length - errors.length} advisory:\n${lines.join('\n')}\n` +
        (errors.length > 0 ? `\n${RING_STATE_LAW}\n` : ''),
    );
  }
  process.exit(errors.length === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`ring-state-guard failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(2);
}
