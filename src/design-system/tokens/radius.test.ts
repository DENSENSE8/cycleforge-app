import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPOSER_MENU_ITEM_CORNER,
  COMPOSER_SHELL_CORNER,
  cornerClass,
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
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
        'rounded-none', // flush — scan stations + grid cells
        'rounded', // chip
        'rounded-md', // row
        'rounded-lg', // control
        'rounded-xl', // field
        'rounded-2xl', // card
        'rounded-3xl', // canvas
        'rounded-full', // pill
      ],
    );
  });

  it('surface matches the field rung — desks are not zero-radius', () => {
    assert.equal(cornerClass('surface'), 'rounded-xl');
    assert.equal(nestedCorner('surface', 0), 'field');
  });

  it('dropdown shells are the 8px control rung', () => {
    assert.equal(DROPDOWN_SHELL_CORNER, 'rounded-lg');
    assert.equal(DROPDOWN_SHELL_CORNER, SEGMENTED_CONTROL_CORNER);
    assert.equal(cornerClass('control'), 'rounded-lg');
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
      // nestedCorner keys off CORNER_PX; `field` renders rounded-xl on desks.
      assert.equal(nestedCorner('canvas', 3), 'field');
      assert.equal(nestedCornerClass('canvas', 3), 'rounded-xl');
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
