/**
 * Pin the Sheets-like column-resize hit target + double-click reset on
 * ColumnResizeHandle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../../../..');
const SRC = readFileSync(
  join(ROOT, 'src/design-system/components/grid/ColumnResizeHandle.tsx'),
  'utf8',
);
const SURFACE = readFileSync(
  join(ROOT, 'src/design-system/components/grid/LedgerGridSurface.tsx'),
  'utf8',
);

describe('ColumnResizeHandle hit target', () => {
  it('uses a 16px (w-4) grab zone — never the retired 8px w-2', () => {
    assert.match(
      SRC,
      /h-full w-4 cursor-col-resize/,
      'hit target must stay w-4 (16px) so operators can grab the seam',
    );
    assert.doesNotMatch(
      SRC,
      /h-full w-2 cursor-col-resize/,
      'w-2 (8px) was too narrow next to click-to-sort — do not regress',
    );
  });

  it('keeps a 1px painted hairline inside the wide hit', () => {
    assert.match(SRC, /w-px rounded bg-border-strong/);
  });

  it('captures the pointer on press for click-and-hold drag', () => {
    assert.match(SRC, /setPointerCapture\(e\.pointerId\)/);
  });
});

describe('ColumnResizeHandle double-click resets to default', () => {
  it('double-click calls resetToDefault, not content autofit', () => {
    assert.match(SRC, /onDoubleClick=\{[\s\S]*?resetToDefault\(\)/);
    assert.doesNotMatch(
      SRC,
      /onDoubleClick=\{[\s\S]*?resizeToFit/,
      'autofit must not live on the grip — that grew the column on double-click',
    );
  });

  it('requires onReset and clears the live CSS var', () => {
    assert.match(SRC, /onReset: \(\) => void/);
    assert.match(SRC, /removeProperty\(gridColVar\(colKey\)\)/);
  });

  it('LedgerGridSurface forwards clearWidth as onResetColumn', () => {
    assert.match(SURFACE, /onResetColumn: clearWidth/);
    assert.match(SURFACE, /clearWidth,/);
  });
});
