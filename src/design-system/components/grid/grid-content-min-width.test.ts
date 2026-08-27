import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gridContentMinWidthPx,
  gridContentMinWidthRem,
} from './grid-column-geometry';

describe('gridContentMinWidthPx — live content-min after drag-resize', () => {
  const columns = [
    { key: 'select', width: 'minmax(2rem, 2rem)' },
    { key: 'order', width: 'minmax(7rem, 7rem)' },
    { key: 'title', width: 'minmax(16rem, 16rem)' },
    { key: '_fill', width: 'minmax(0rem, 1fr)' },
  ] as const;

  it('uses rem floors when no overrides (16px root)', () => {
    // 2 + 7 + 16 + 0 = 25rem → 400px
    assert.equal(gridContentMinWidthPx(columns, {}, 16), 400);
    assert.equal(gridContentMinWidthRem(columns), 25);
  });

  it('replaces a track rem floor with its persisted px override', () => {
    // title 16rem→256 replaced by 486; others unchanged: 2*16 + 7*16 + 486 + 0
    assert.equal(
      gridContentMinWidthPx(columns, { title: 486 }, 16),
      32 + 112 + 486,
    );
  });

  it('fill / 0rem tracks add nothing (even with a stray override)', () => {
    assert.equal(
      gridContentMinWidthPx(
        [{ key: '_fill', width: 'minmax(0rem, 1fr)' }],
        { _fill: 999 },
        16,
      ),
      0,
    );
    assert.equal(
      gridContentMinWidthPx(
        [{ key: '_fill', width: 'minmax(0rem, 1fr)' }],
        {},
        16,
      ),
      0,
    );
  });

  it('ignores non-finite / non-positive overrides', () => {
    assert.equal(
      gridContentMinWidthPx(columns, { title: 0, order: Number.NaN }, 16),
      400,
    );
  });
});
