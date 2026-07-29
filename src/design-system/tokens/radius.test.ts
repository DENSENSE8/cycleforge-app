import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cornerClass,
  nestedCorner,
  nestedCornerClass,
  radius,
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
        'rounded-none',
        'rounded',
        'rounded-md',
        'rounded-lg',
        'rounded-xl',
        'rounded-2xl',
        'rounded-3xl',
        'rounded-full',
      ],
    );
  });

  describe('nestedCorner — concentric inner = outer − padding', () => {
    it('reproduces the one pairing the house already documents by hand', () => {
      // station-workbench.md: glass `rounded-3xl` worksheet + `p-3` takes
      // `rounded-xl` inner fields (WORKSPACE_NESTED_FIELD). 24px − 12px = 12px.
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
