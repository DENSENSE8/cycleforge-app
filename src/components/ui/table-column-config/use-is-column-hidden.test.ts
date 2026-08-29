/**
 * `useIsColumnHidden` is fenced to the TWO-ZONE CHIP modules — the row identity
 * chips, the meta columns, their shared track constants, and the header that
 * labels them. Nothing else may read a staff hide-preference directly: on the
 * spreadsheet families, visibility is resolved once by `LedgerGridSurface` and
 * handed down, and a component reaching around that would be a second answer to
 * "is this column showing".
 *
 * ## Why the count moved back to four (2026-08-29)
 *
 * This guard used to assert `3, not 4` and separately assert that
 * `StationRowColumnHeader.tsx` did not exist. Both encoded a moment, not a rule:
 * the header was deleted in the 2026-08-20 teardown along with the station
 * surfaces it labels, and it returned with them in Phase 4b of
 * `docs/todo/one-sheet-table-sot-PLAN.md`.
 *
 * It belongs inside the fence rather than outside it. `ChipColumns`,
 * `RowMetaColumns` and `OrderIdentityChips` render the two-zone chip row;
 * `StationRowColumnHeader` renders the LABELS above that same row and has to
 * hide exactly the tracks they hide, or the labels stop lining up with the
 * chips. That is the same job, not a fourth consumer of a fenced hook.
 *
 * So the assertion is now the FENCE — which modules may consume it — and not a
 * number. A number goes red every time a legitimate surface comes or goes, which
 * is what this file just did.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('useIsColumnHidden consumers', () => {
  it('only the two-zone chip modules consume it', () => {
    const consumers: string[] = [];
    for (const file of walkTs(SRC)) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('useIsColumnHidden')) continue;
      const rel = relative(ROOT, file).split('\\').join('/');
      if (rel.endsWith('TableColumnConfig.tsx')) continue; // definition
      if (!/import\s*\{[^}]*useIsColumnHidden/.test(src)) continue;
      consumers.push(rel);
    }
    consumers.sort();
    assert.deepEqual(
      consumers,
      [
        // The header that LABELS the two-zone chip row — it must hide exactly
        // the tracks the row hides, or labels and chips stop lining up.
        'src/components/dashboard/queue-table/StationRowColumnHeader.tsx',
        'src/components/ui/ChipColumns.tsx',
        'src/components/ui/OrderIdentityChips.tsx',
        'src/components/ui/RowMetaColumns.tsx',
      ],
      `useIsColumnHidden escaped the two-zone chip fence. Got ${consumers.length}: ` +
        `${consumers.join(', ')}. On a spreadsheet family, visibility is resolved ` +
        `once by LedgerGridSurface and handed down — do not read the pref directly.`,
    );
  });
});
