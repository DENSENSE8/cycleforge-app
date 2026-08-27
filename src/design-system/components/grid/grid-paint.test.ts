/**
 *   npx tsx --test src/design-system/components/grid/grid-paint.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  LEDGER_GRID_HEADER_ESTIMATE_PX,
  LEDGER_GRID_OVERSCAN,
  LEDGER_GRID_ROW_ESTIMATE_PX,
} from './grid-paint';

describe('LedgerGrid paint knobs', () => {
  it('keeps overscan small enough that first paint is a viewport, not the list', () => {
    assert.ok(LEDGER_GRID_OVERSCAN > 0, 'virtualizer needs some overscan to hide measure pop-in');
    assert.ok(
      LEDGER_GRID_OVERSCAN * LEDGER_GRID_ROW_ESTIMATE_PX <= 280,
      'overscan budget stays under ~280px each side for SI',
    );
    assert.ok(LEDGER_GRID_ROW_ESTIMATE_PX >= 32, 'dense rows still have a readable floor');
    assert.ok(LEDGER_GRID_HEADER_ESTIMATE_PX > 0);
  });

  it('VirtualGroupedSections consumes the shipped overscan constant', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/design-system/components/grid/VirtualGroupedSections.tsx'),
      'utf8',
    );
    assert.match(src, /overscan:\s*LEDGER_GRID_OVERSCAN/);
    assert.doesNotMatch(src, /overscan:\s*10\b/);
  });
});
