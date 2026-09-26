/**
 * CLI face of the desk surface law (`src/lib/design/desk-surface-law.ts`):
 * which surface a desktop job may use — a record opens in place of the
 * fixed-width list (DeskStageOverlay), never in the right rail; search never
 * remounts a desk table; no new `inspector` table bindings.
 *
 *   node_modules/.bin/tsx scripts/desk-surface-guard.ts [--json]
 *
 * The `Desk surface` gate in `verify:fast` / `verify` (CI runs `pnpm verify`).
 * Rules, ledger and baselines live in src/lib/design — this script only walks
 * the tree and prints the verdict.
 *
 * Exit 0 = the law holds. Exit 1 = violations or ratchet drift, listed.
 * Exit 2 = the guard itself broke, which is never a verdict.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  auditDeskSurfaces,
  DESK_SURFACE_RULES,
  formatDeskSurfaceViolation,
} from '../src/lib/design/desk-surface-law';
import { DESK_SURFACE_DEBT_BASELINE, DESK_SURFACE_LEDGER } from '../src/lib/design/desk-surface-ledger';

const asJson = process.argv.includes('--json');
const REPO = path.resolve(__dirname, '..');
const posix = (p: string) => p.split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

try {
  const files = walk(path.join(REPO, 'src')).map((abs) => {
    const file = posix(path.relative(REPO, abs));
    return { file, source: readFileSync(abs, 'utf8') };
  });
  const audit = auditDeskSurfaces(files, DESK_SURFACE_LEDGER, DESK_SURFACE_DEBT_BASELINE);
  const ok = audit.violations.length === 0 && audit.problems.length === 0;

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok, ...audit }, null, 2)}\n`);
  } else if (ok) {
    const debt = DESK_SURFACE_RULES.map((r) => `${r.id} ${audit.debt[r.id]?.count ?? 0}`).join(' · ');
    process.stdout.write(`desk-surface-guard: the desk surface law holds. Debt (shrink-only): ${debt}.\n`);
  } else {
    const lines = [
      ...audit.violations.map((v) => `  ${formatDeskSurfaceViolation(v)}`),
      ...audit.problems.map((p) => `  ${p}`),
    ];
    process.stdout.write(`desk-surface-guard:\n${lines.join('\n')}\n`);
  }
  process.exit(ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`desk-surface-guard failed: ${String(error)}\n`);
  process.exit(2);
}
