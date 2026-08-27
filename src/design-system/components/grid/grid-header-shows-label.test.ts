import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridHeaderShowsLabel } from './grid-column-geometry';

describe('gridHeaderShowsLabel — flex-track label rule', () => {
  it('a flex (1fr) column always shows its label, even below its label-fit floor', () => {
    // Receiving Product's regression: a small drain floor (< labelFitRem) must
    // NOT degrade a flex title to a type glyph — the 1fr track renders at its
    // slack share, not its floor.
    const flexTitleTinyFloor = {
      key: 'title',
      width: 'minmax(4rem, 1fr)',
      gridLabel: 'Product',
      labelFitRem: 8,
    };
    assert.equal(gridHeaderShowsLabel(flexTitleTinyFloor), true);

    const flexTitleRealFloor = {
      key: 'title',
      width: 'minmax(8rem, 1fr)',
      gridLabel: 'Product',
      labelFitRem: 8,
    };
    assert.equal(gridHeaderShowsLabel(flexTitleRealFloor), true);
  });

  it('headerGlyphOnly still wins over the flex rule', () => {
    // Incoming Pipeline: deliberately mute icon-only headers — never a label.
    const glyphOnlyFlex = {
      key: 'title',
      width: 'minmax(4rem, 1fr)',
      gridLabel: 'Product',
      labelFitRem: 8,
      headerGlyphOnly: true,
    };
    assert.equal(gridHeaderShowsLabel(glyphOnlyFlex), false);
  });

  it('a FIXED track still degrades to a glyph when its floor is below the label-fit', () => {
    // Non-flex tracks keep the measured width gate (never clip; degrade).
    const fixedNarrow = {
      key: 'title',
      width: 'minmax(4rem, 4rem)',
      gridLabel: 'Product',
      labelFitRem: 8,
    };
    assert.equal(gridHeaderShowsLabel(fixedNarrow), false);

    const fixedWide = {
      key: 'title',
      width: 'minmax(12rem, 12rem)',
      gridLabel: 'Product',
      labelFitRem: 8,
    };
    assert.equal(gridHeaderShowsLabel(fixedWide), true);
  });
});
