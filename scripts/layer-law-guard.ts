/**
 * CLI face of the layer laws 3 · 4 · 5 (`HANDOFF-view-spec-layers.md` §2).
 *
 * The rule lives in `src/lib/views/layer-law.ts` — ONE module, two consumers:
 *
 *   1. `layer-law.test.ts` — what each law flags and spares.
 *   2. this script — `node_modules/.bin/tsx scripts/layer-law-guard.ts [--json]`,
 *      the `Layer laws` verify gate (`always`: a source read, <1s).
 *
 * Exit 0 = no new violation and no stale allowlist entry. Exit 1 = either,
 * listed. Exit 2 = the guard itself broke, which is never a verdict.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  auditLayerSource,
  formatLayerViolation,
  judgeLayerLaws,
  LAYER_LAW_TEXT,
  lawsForFile,
  type LayerViolation,
} from '../src/lib/views/layer-law';

const asJson = process.argv.includes('--json');
const REPO = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

try {
  const hits: LayerViolation[] = [];
  let scanned = 0;
  for (const full of walk(path.join(REPO, 'src'))) {
    const rel = path.relative(REPO, full).split(path.sep).join('/');
    if (lawsForFile(rel).length === 0) continue;
    scanned += 1;
    hits.push(...auditLayerSource(rel, readFileSync(full, 'utf8')));
  }
  const { violations, allowed, stale } = judgeLayerLaws(hits);
  const ok = violations.length === 0 && stale.length === 0;

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok, violations, stale, allowed: allowed.length, laws: LAYER_LAW_TEXT }, null, 2)}\n`);
  } else {
    const lines = [
      `layer-law-guard: ${scanned} files scanned, ${violations.length} new violation(s), ${allowed.length} allowlisted hit(s) (burn-down).`,
    ];
    for (const v of violations) lines.push(`  ${formatLayerViolation(v)}\n    → ${LAYER_LAW_TEXT[v.law]}`);
    for (const s of stale) {
      lines.push(`  stale allowlist: Law ${s.law} ${s.file} no longer violates — delete its entry in src/lib/views/layer-law.ts`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  process.exit(ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`layer-law-guard failed: ${String(error)}\n`);
  process.exit(2);
}
