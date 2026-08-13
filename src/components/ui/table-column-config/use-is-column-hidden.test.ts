/**
 * `useIsColumnHidden` is fenced to the three leftover two-zone chip slots.
 * StationRowColumnHeader (the 4th consumer) is deleted — 4 → 3.
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
  it('is 3 (not 4) — StationRowColumnHeader is gone', () => {
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
        'src/components/ui/ChipColumns.tsx',
        'src/components/ui/OrderIdentityChips.tsx',
        'src/components/ui/RowMetaColumns.tsx',
      ],
      `expected 3 two-zone consumers, got ${consumers.length}: ${consumers.join(', ')}`,
    );
  });

  it('StationRowColumnHeader is deleted', () => {
    const gone = join(ROOT, 'src/components/dashboard/queue-table/StationRowColumnHeader.tsx');
    assert.equal(statSync(gone, { throwIfNoEntry: false })?.isFile() ?? false, false);
  });
});
