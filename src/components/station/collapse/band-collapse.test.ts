import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BAND_COLLAPSE_INITIAL,
  bandCollapseReducer,
  isBandOpen,
  type BandCollapseState,
} from './band-collapse';

const BANDS = ['items', 'label', 'placement'] as const;

const reduce = (
  state: BandCollapseState,
  ...events: Parameters<typeof bandCollapseReducer>[1][]
) => events.reduce(bandCollapseReducer, state);

describe('band collapse — the default rule', () => {
  it('follows the centre: open while the centre is open', () => {
    for (const id of BANDS) {
      assert.equal(isBandOpen(BAND_COLLAPSE_INITIAL, id, false), true);
      assert.equal(isBandOpen(BAND_COLLAPSE_INITIAL, id, true), false);
    }
  });

});

describe('band collapse — opening one band out of a collapsed stack', () => {
  it('opens the pressed band and leaves its siblings closed', () => {
    const next = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'toggle',
      bandId: 'items',
      allCollapsed: true,
    });
    assert.equal(isBandOpen(next, 'items', true), true);
    assert.equal(isBandOpen(next, 'label', true), false);
    assert.equal(isBandOpen(next, 'placement', true), false);
  });

  it('open is idempotent and does not close siblings', () => {
    const opened = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'open',
      bandId: 'label',
      allCollapsed: true,
    });
    assert.equal(isBandOpen(opened, 'label', true), true);
    assert.equal(isBandOpen(opened, 'items', true), false);
    const again = reduce(opened, { kind: 'open', bandId: 'label', allCollapsed: true });
    assert.equal(isBandOpen(again, 'label', true), true);
  });

  it('close shuts one band without touching siblings', () => {
    const next = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'close',
      bandId: 'label',
      allCollapsed: false,
    });
    assert.equal(isBandOpen(next, 'label', false), false);
    assert.equal(isBandOpen(next, 'items', false), true);
  });
  it('a first press on an OPEN band closes it (never a no-op)', () => {
    const next = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'toggle',
      bandId: 'label',
      allCollapsed: false,
    });
    assert.equal(isBandOpen(next, 'label', false), false);
    assert.equal(isBandOpen(next, 'items', false), true);
  });

  it('closing every band by hand leaves nothing open', () => {
    const next = reduce(
      BAND_COLLAPSE_INITIAL,
      { kind: 'toggle', bandId: 'items', allCollapsed: false },
      { kind: 'toggle', bandId: 'label', allCollapsed: false },
      { kind: 'toggle', bandId: 'placement', allCollapsed: false },
    );
    for (const id of BANDS) assert.equal(isBandOpen(next, id, false), false);
  });
});

describe('band collapse — pins are spent when the centre moves', () => {
  it('Collapse all is not exempted by a band the operator opened earlier', () => {
    const opened = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'toggle',
      bandId: 'items',
      allCollapsed: false,
    });
    // `collapsed` flips under it (Collapse all / a scroll / the composer).
    for (const id of BANDS) assert.equal(isBandOpen(opened, id, true), false);
  });

  it('a scroll back to the top re-opens every band, pins included', () => {
    const closed = reduce(BAND_COLLAPSE_INITIAL, {
      kind: 'toggle',
      bandId: 'items',
      allCollapsed: true,
    });
    assert.equal(isBandOpen(closed, 'items', true), true);
    // Centre re-expands → the pin taken under `collapsed` no longer speaks.
    assert.equal(isBandOpen(closed, 'items', false), true);
    assert.equal(isBandOpen(closed, 'label', false), true);
  });
});
