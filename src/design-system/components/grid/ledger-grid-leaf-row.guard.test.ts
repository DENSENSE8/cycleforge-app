/**
 * Guard: leaf rows that mount `LedgerGridLeafRow` must still compose
 * `ledgerGridCell` (or a surface alias) + `gridCellAlignClass` so chrome and
 * justification stay on the DS SoT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const LEAF_ADOPTERS = [
  'src/components/warehouse/bins-grid/BinsGridRow.tsx',
  'src/components/outbound/ready/grid/ReadyGridRow.tsx',
  'src/components/products/catalog/catalog-grid/CatalogGridRow.tsx',
  'src/components/station/incoming-grid/IncomingGridRow.tsx',
] as const;

describe('LedgerGridLeafRow adopters', () => {
  it('listed adopters import LedgerGridLeafRow and compose align + cell chrome', () => {
    for (const rel of LEAF_ADOPTERS) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      assert.ok(
        src.includes('LedgerGridLeafRow'),
        `${rel} must mount LedgerGridLeafRow`,
      );
      assert.ok(
        /GridCell\(|ledgerGridCell\(/.test(src) ||
          src.includes('binsGridCell') ||
          src.includes('readyGridCell') ||
          src.includes('catalogGridCell') ||
          src.includes('incomingGridCell') ||
          src.includes('renderCatalogGridCell') ||
          src.includes('renderReadyGridCell') ||
          src.includes('renderBinsGridCell') ||
          src.includes('renderIncomingGridCell'),
        `${rel} must compose ledgerGridCell (or a surface alias / cell registry)`,
      );
      // Align may live in the cell registry rather than the thin row.
      const registryHint =
        src.includes('renderCatalogGridCell') ||
        src.includes('renderReadyGridCell') ||
        src.includes('renderBinsGridCell') ||
        src.includes('renderIncomingGridCell');
      assert.ok(
        src.includes('gridCellAlignClass') || registryHint,
        `${rel} must compose gridCellAlignClass on value cells (row or registry)`,
      );
    }
  });

  it('LedgerGridLeafRow module exports from the grid barrel', () => {
    const barrel = readFileSync(
      join(ROOT, 'src/design-system/components/grid/index.ts'),
      'utf8',
    );
    assert.ok(barrel.includes('LedgerGridLeafRow'));
    assert.ok(barrel.includes('ledgerGridCell'));
  });
});
