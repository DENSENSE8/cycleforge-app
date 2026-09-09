/**
 * The compound model's headers all start at their track's left edge.
 *
 *   npx tsx --test src/components/tables/compound/compound-column-align.test.ts
 *
 * `thumb` declared `align: 'center'` until 2026-09-04 — the only `center` in
 * the product — so "Image" floated in the middle of its track while every other
 * label on the desk began at the left. The header row's whole job is to draw
 * one line the eye runs down; a single centred word breaks it. Operator
 * 2026-09-04: align the image text to the far left, not the centre fork.
 *
 * Asserted against the REAL model rather than the resolver, because the
 * resolver was never wrong — `image` has always resolved to `start` by type.
 * What has to stay true is that no track overrides it back.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveGridColumnAlign } from '@/design-system/components/grid/grid-header-align';
import { COMPOUND_TRACKS } from './compound-columns';
import {
  COMPOUND_GUTTER_TRACK_REM,
  COMPOUND_ROW_PX,
  COMPOUND_SELECT_TRACK_REM,
} from './compound-row-chrome';

describe('compound column alignment', () => {
  it('only the photo track declares center', () => {
    // The word captions a full-bleed 48px square that has no left edge of its
    // own (operator 2026-09-04). Every other label starts at its track's left
    // edge, which is the ruler the header row is for.
    const centered = COMPOUND_TRACKS.filter((c) => c.align === 'center').map((c) => c.key);
    assert.deepEqual(centered, ['thumb']);
  });

  it('the photo gutter header centres over its square', () => {
    const thumb = COMPOUND_TRACKS.find((c) => c.key === 'thumb');
    assert.ok(thumb, 'thumb track missing');
    assert.equal(resolveGridColumnAlign(thumb!), 'center');
  });
});

/**
 * The select gutter is a CONTROL track, not a square.
 *
 * `select` and `thumb` shared one constant while both were full-bleed squares.
 * They stopped doing the same job on 2026-09-04: the photo still wants 48×48
 * (a square source fills it uncropped), the select gutter holds a 16px
 * hover-revealed checkbox, and 48px around a 16px mark is 16px of dead track on
 * either side of the first thing an operator's eye reaches. Operator: smaller
 * in width, not a box or square, hard left with minimal padding.
 *
 * Pinned because "the two gutters are equal" was load-bearing prose in three
 * files, and re-deriving `select` from `COMPOUND_GUTTER_TRACK_REM` is the exact
 * one-word regression that would silently restore it.
 */
describe('the select gutter track', () => {
  const track = (key: string) => COMPOUND_TRACKS.find((c) => c.key === key)?.width;

  it('is narrower than the photo gutter', () => {
    assert.equal(track('select'), `minmax(${COMPOUND_SELECT_TRACK_REM}rem, ${COMPOUND_SELECT_TRACK_REM}rem)`);
    assert.notEqual(track('select'), track('thumb'));
    assert.ok(COMPOUND_SELECT_TRACK_REM < COMPOUND_GUTTER_TRACK_REM);
  });

  it('leaves the least slack a bordered 16px control can take', () => {
    // 16px face + 4px a side. Any narrower and the box touches the table edge.
    assert.equal(COMPOUND_SELECT_TRACK_REM * 16, 24);
  });

  it('keeps the photo gutter square — the reason the two split', () => {
    assert.equal(COMPOUND_GUTTER_TRACK_REM * 16, COMPOUND_ROW_PX);
  });
});
