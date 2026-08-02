/**
 * Shrink-only guard for the RETIRED `useIsColumnHidden()` path.
 *
 * `useIsColumnHidden()` is the legacy cell-granularity visibility predicate. It
 * asks "is this key hidden?" *inside* a cell, so a hidden column left the track
 * in place and rendered an empty ruled band where the content used to be. The
 * grid families replaced it with `useGridColumnVisibility`, which resolves the
 * visible TRACK LIST once and removes the column outright — header, rows,
 * summaries and the grid template all consume the same answer.
 *
 * The hook survives for the chip/meta SLOT primitives, where the question really
 * is per-cell: they paint an optional chip inside a cell the row already owns,
 * so there is no track to remove.
 *
 * ## Why this file exists
 *
 * `source-of-truth.md` said the hook "survives only for `ChipColumns` /
 * `RowMetaColumns`" — two consumers. There were four. The prose was written when
 * it was true and then quietly stopped being true, and nothing anywhere noticed,
 * because a retirement asserted in a rules file is a claim no test can fail.
 *
 * That is the general lesson this guard is the instance of
 * (`pattern-evolution.md` → Always): **a retirement is not done until the old
 * path is deleted, or a guard names the exact surviving call sites.** A
 * prose-only retirement is a TODO wearing a ruling's clothes.
 *
 * ## The contract
 *
 * The allowlist below is SHRINK-ONLY, like every other ratchet in this repo
 * (`verify.md`). Finishing a migration removes a line. Adding one — especially
 * from a grid family — means re-opening the empty-ruled-band bug the migration
 * closed, so the test fails and asks for the track-level hook instead.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(process.cwd(), 'src');

/**
 * The exact surviving consumers, with the reason each one is legitimately
 * per-cell. Remove a line when its surface migrates; never add one.
 */
const ALLOWED_CONSUMERS: Record<string, string> = {
  'components/ui/ChipColumns.tsx':
    'chip SLOT inside a cell — no track of its own to remove',
  'components/ui/RowMetaColumns.tsx':
    'meta SLOT inside the row title cell — no track of its own to remove',
  'components/ui/OrderIdentityChips.tsx':
    'identity chip slot; renders inside an existing cell, not as a track',
  'components/dashboard/queue-table/StationRowColumnHeader.tsx':
    'legacy station queue header — pre-LedgerGrid; migrate with that surface',
};

/** The module that defines the hook is not a consumer of it. */
const DEFINITION = 'components/ui/table-column-config/TableColumnConfig.tsx';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * A CALL, not a mention — and the difference is the whole guard.
 *
 * Docblocks across the grid families reference the hook to explain why they no
 * longer use it, and they write it with parens (`useIsColumnHidden()`), so a
 * bare `/useIsColumnHidden\s*\(/` flags `useGridColumnVisibility.ts` for the
 * sentence documenting the migration. Strip comments first, then match: a call
 * lives in code, a mention lives in prose.
 */
const CALL_RE = /\buseIsColumnHidden\s*\(/;

/** Remove block and line comments (good enough — no regex/string edge cases matter here). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function findCallers(): string[] {
  return walk(SRC)
    .filter((f) => !f.endsWith('.guard.test.ts') && !f.endsWith('.test.ts'))
    .filter((f) => CALL_RE.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .filter((rel) => rel !== DEFINITION)
    .sort();
}

describe('useIsColumnHidden — retired path, shrink-only allowlist', () => {
  it('has no consumer outside the allowlist', () => {
    const unexpected = findCallers().filter((f) => !(f in ALLOWED_CONSUMERS));
    assert.deepEqual(
      unexpected,
      [],
      `useIsColumnHidden() is the RETIRED cell-granularity path — it leaves an ` +
        `empty ruled band instead of removing the track.\n` +
        `New consumer(s):\n  ${unexpected.join('\n  ')}\n\n` +
        `A grid family resolves visibility through useGridColumnVisibility ` +
        `(descriptor tier + staff delta + viewport), which the header, rows, ` +
        `summaries and grid template all read. Use that instead.`,
    );
  });

  it('allowlist has no stale entries — a finished migration removes its line', () => {
    const callers = new Set(findCallers());
    const stale = Object.keys(ALLOWED_CONSUMERS).filter((f) => !callers.has(f));
    assert.deepEqual(
      stale,
      [],
      `These files no longer call useIsColumnHidden(), so the allowlist is ` +
        `over-stating the surviving surface — exactly the drift this guard ` +
        `exists to prevent. Delete them from ALLOWED_CONSUMERS:\n  ` +
        `${stale.join('\n  ')}`,
    );
  });

  it('no grid family calls it', () => {
    const gridish = findCallers().filter((f) =>
      /(^|\/)(grid|ledger-grid|.*-grid)\//.test(f) || /Grid[A-Z]/.test(f),
    );
    assert.deepEqual(
      gridish,
      [],
      `Grid families must resolve visibility at TRACK granularity via ` +
        `useGridColumnVisibility:\n  ${gridish.join('\n  ')}`,
    );
  });
});
