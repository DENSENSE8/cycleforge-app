/**
 *   npx tsx --test src/components/ui/table-column-config/useColumnWidths.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COLUMN_WIDTH_ABSOLUTE_MAX,
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  clampColumnWidth,
  resolveColumnWidthClamp,
} from './useColumnWidths';

describe('resolveColumnWidthClamp', () => {
  it('defaults to house 64…720', () => {
    assert.deepEqual(resolveColumnWidthClamp({}), {
      minPx: COLUMN_WIDTH_MIN,
      maxPx: COLUMN_WIDTH_MAX,
    });
  });

  it('raises floor with typed track + staff min', () => {
    assert.deepEqual(
      resolveColumnWidthClamp({ typedFloorPx: 128, staffMin: 100 }),
      { minPx: 128, maxPx: COLUMN_WIDTH_MAX },
    );
    assert.deepEqual(
      resolveColumnWidthClamp({ typedFloorPx: 80, staffMin: 120 }),
      { minPx: 120, maxPx: COLUMN_WIDTH_MAX },
    );
  });

  it('staff max can raise ceiling up to absolute 2000', () => {
    assert.deepEqual(resolveColumnWidthClamp({ staffMax: 900 }), {
      minPx: COLUMN_WIDTH_MIN,
      maxPx: 900,
    });
    assert.deepEqual(resolveColumnWidthClamp({ staffMax: 5000 }), {
      minPx: COLUMN_WIDTH_MIN,
      maxPx: COLUMN_WIDTH_ABSOLUTE_MAX,
    });
  });

  it('never lets max fall below min', () => {
    assert.deepEqual(
      resolveColumnWidthClamp({ staffMin: 400, staffMax: 200 }),
      { minPx: 400, maxPx: 400 },
    );
  });
});

describe('clampColumnWidth', () => {
  it('floors and ceilings with optional overrides', () => {
    assert.equal(clampColumnWidth(10), COLUMN_WIDTH_MIN);
    assert.equal(clampColumnWidth(900), COLUMN_WIDTH_MAX);
    assert.equal(clampColumnWidth(50, 100, 200), 100);
    assert.equal(clampColumnWidth(250, 100, 200), 200);
    assert.equal(clampColumnWidth(150.7, 100, 200), 151);
  });
});
