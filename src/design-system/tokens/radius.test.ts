import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPOSER_MENU_ITEM_CORNER,
  COMPOSER_SHELL_CORNER,
  cornerClass,
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
  SPINE_ROW_CORNER,
  nestedCorner,
  nestedCornerClass,
  radius,
  SEGMENTED_CONTROL_CORNER,
  type CornerRole,
} from './radius';

describe('radius SoT', () => {
  it('mirrors Tailwind stock borderRadius — the values the rounded-* classes render', () => {
    // The regression this pins: the scale used to sit one step ABOVE the class
    // of the same name (lg was 0.75rem while `rounded-lg` renders 0.5rem), so
    // reasoning through a token name shipped ~4px wrong.
    assert.equal(radius.none, '0px');
    assert.equal(radius.sm, '0.125rem'); // rounded-sm  →  2px
    assert.equal(radius.DEFAULT, '0.25rem'); // rounded     →  4px
    assert.equal(radius.md, '0.375rem'); // rounded-md  →  6px
    assert.equal(radius.lg, '0.5rem'); // rounded-lg  →  8px
    assert.equal(radius.xl, '0.75rem'); // rounded-xl  → 12px
    assert.equal(radius['2xl'], '1rem'); // rounded-2xl → 16px
    assert.equal(radius['3xl'], '1.5rem'); // rounded-3xl → 24px
    assert.equal(radius.full, '9999px');
  });

  it('maps every role to a real Tailwind rounded-* class', () => {
    const roles: CornerRole[] = [
      'flush',
      'chip',
      'row',
      'control',
      'field',
      'card',
      'canvas',
      'pill',
    ];
    assert.deepEqual(
      roles.map(cornerClass),
      [
        'rounded-none', // flush
        'rounded-none', // chip   (flushed 0c)
        'rounded-none', // row    (flushed 0c)
        'rounded-none', // control (flushed 0b)
        'rounded-none', // field  (flushed 0b)
        'rounded-none', // card   (flushed 0d)
        'rounded-none', // canvas (flushed 0e)
        'rounded-full', // pill   (status dots · avatars · Switch only)
      ],
    );
  });

  it('surface (triage panels) is square — triage shares the industrial identity', () => {
    assert.equal(cornerClass('surface'), 'rounded-none');
    assert.equal(nestedCorner('surface', 0), 'flush');
  });

  it('dropdown shells are the 8px control rung — ladder stays flush', () => {
    assert.equal(DROPDOWN_SHELL_CORNER, 'rounded-lg');
    assert.equal(DROPDOWN_SHELL_CORNER, SEGMENTED_CONTROL_CORNER);
    assert.equal(cornerClass('control'), 'rounded-none');
  });

  it('the header icon face is FLUSH — square, edge to edge on the beam', () => {
    // Operator 2026-09-22:
    // Operator 2026-09-22: "no spacing or padding for the icons … zero corner
    assert.equal(cornerClass('flush'), 'rounded-none');
  });

  it('spine rows and labelled Search are the 4px chip rung — ladder stays flush', () => {
    assert.equal(SPINE_ROW_CORNER, 'rounded');
    assert.equal(SPINE_ROW_CORNER, DROPDOWN_ITEM_CORNER);
    assert.equal(cornerClass('chip'), 'rounded-none');
  });

  it('dropdown rows nest inside the 8px shell padded p-1', () => {
    assert.equal(DROPDOWN_SHELL_CORNER, 'rounded-lg');
    assert.equal(DROPDOWN_ITEM_CORNER, 'rounded');
  });

  it('composer menu rows nest inside the 16px shell padded p-1', () => {
    assert.equal(COMPOSER_SHELL_CORNER, 'rounded-2xl');
    assert.equal(COMPOSER_MENU_ITEM_CORNER, 'rounded-xl');
  });

  describe('nestedCorner — concentric inner = outer − padding', () => {
    it('reproduces the one pairing the house already documents by hand', () => {
      // nestedCorner keys off CORNER_PX (untouched by the zero-radius staging), so the returned ROLE is still `field` for a canvas + p-3 nest.
      assert.equal(nestedCorner('canvas', 3), 'field');
      assert.equal(nestedCornerClass('canvas', 3), 'rounded-none');
    });

    it('steps down the ladder as padding grows', () => {
      assert.equal(nestedCorner('card', 2), 'control'); // 16 − 8  = 8
      assert.equal(nestedCorner('field', 2), 'chip'); //  12 − 8  = 4
      assert.equal(nestedCorner('canvas', 4), 'control'); // 24 − 16 = 8
    });

    it('snaps DOWN to a real house corner, never an arbitrary px', () => {
      // 24 − 4 = 20px, which is between card (16) and canvas (24) → card.
      assert.equal(nestedCorner('canvas', 1), 'card');
    });

    it('collapses to flush when padding meets or exceeds the outer radius', () => {
      assert.equal(nestedCorner('card', 4), 'flush'); // 16 − 16 = 0
      assert.equal(nestedCorner('control', 6), 'flush'); // 8 − 24 < 0
      assert.equal(nestedCorner('flush', 0), 'flush');
    });

    it('treats a pill container as its largest real corner, not 9999px', () => {
      // A pill has no meaningful concentric inset; fall back to canvas so the
      // helper returns something sane instead of always the largest role.
      assert.equal(nestedCorner('pill', 3), 'field');
    });

    it('ignores negative padding rather than growing the corner', () => {
      assert.equal(nestedCorner('card', -2), 'card');
    });
  });
});
