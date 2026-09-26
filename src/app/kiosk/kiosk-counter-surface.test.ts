/** The counter scale is a SIBLING of the ops ladder, not a replacement. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cornerClass, type CornerRole } from '@/design-system/tokens/radius';
import {
  COUNTER_CARD_PAD_STEP,
  COUNTER_CTA,
  COUNTER_FIELD,
  COUNTER_MIN_FIELD_TEXT_PX,
  COUNTER_MIN_TARGET_PX,
  COUNTER_PANEL,
  COUNTER_RHYTHM,
  COUNTER_ROW,
  COUNTER_SECTION,
  COUNTER_TEXT,
  COUNTER_TOUCH,
  counterCorner,
  counterCornerPx,
  counterNestedCorner,
  type CounterCornerRole,
} from './kiosk-counter-surface';

/** Every role except the two that are identical on both scales by design. */
const SOFTENED_ROLES: CornerRole[] = ['chip', 'row', 'control', 'field', 'card', 'canvas'];

describe('kiosk counter scale — radius', () => {
  it('softens every content role away from the flushed ops ladder', () => {
    for (const role of SOFTENED_ROLES) {
      assert.equal(cornerClass(role), 'rounded-none', `ops ${role} must stay flush`);
      assert.notEqual(
        counterCorner(role),
        'rounded-none',
        `counter ${role} must not be flush — that is the whole point of this module`,
      );
    }
  });

  it('keeps `flush` flush — column seams are structure, not components', () => {
    // Rounding the seams floats the columns and re-introduces the banned
    // "floating column islands".
    assert.equal(counterCorner('flush'), 'rounded-none');
    assert.equal(counterCornerPx('flush'), 0);
  });

  it('keeps `pill` identical on both scales', () => {
    assert.equal(counterCorner('pill'), cornerClass('pill'));
  });

  it('adds a `cta` role, which the ops ladder deliberately has no twin for', () => {
    assert.equal(counterCorner('cta'), 'rounded-2xl');
    // @ts-expect-error — `cta` is not an ops CornerRole; ops CTAs are flush.
    assert.equal(cornerClass('cta'), undefined);
  });

  it('is monotonic: chip ≤ control ≤ card ≤ canvas', () => {
    const ladder: CounterCornerRole[] = ['flush', 'chip', 'control', 'card', 'canvas'];
    const px = ladder.map(counterCornerPx);
    assert.deepEqual([...px].sort((a, b) => a - b), px, `ladder out of order: ${px.join(',')}`);
  });

  it('every role maps to a real class and a real px value', () => {
    const roles: CounterCornerRole[] = [
      'flush', 'chip', 'row', 'control', 'field', 'cta', 'card', 'canvas', 'surface', 'pill',
    ];
    for (const role of roles) {
      assert.match(counterCorner(role), /^rounded-/, `${role} class`);
      assert.equal(typeof counterCornerPx(role), 'number', `${role} px`);
    }
  });

  it('nests concentrically — a padded card takes a smaller inner corner', () => {
    // inner = outer − padding. Under the flushed ops ladder this math is a
    // no-op; on the counter it is load-bearing again.
    const inner = counterNestedCorner('card', COUNTER_CARD_PAD_STEP);
    assert.notEqual(inner, counterCorner('card'), 'inner must be tighter than its container');
    assert.match(inner, /^rounded-/);
  });
});

describe('kiosk counter scale — touch + type', () => {
  it('every commit target clears the 48px floor; only a choose-among chip may sit under it', () => {
    assert.equal(COUNTER_TOUCH.control, 'min-h-12'); // 48
    assert.equal(COUNTER_TOUCH.cta, 'min-h-14'); // 56
    assert.equal(COUNTER_TOUCH.chip, 'min-h-10'); // 40 — selection, never a commit
    assert.equal(COUNTER_MIN_TARGET_PX, 48);
  });

  it('field text is ≥16px — under it, iOS Safari zooms the page on focus', () => {
    assert.equal(COUNTER_TEXT.field, 'text-base');
    assert.equal(COUNTER_MIN_FIELD_TEXT_PX, 16);
    // text-sm (14px) is the thing being replaced; it must not be the field size.
    assert.notEqual(COUNTER_TEXT.field, 'text-sm');
  });
});

describe('kiosk counter scale — composed faces', () => {
  it('sections separate by GAP, never by a hairline on a full-bleed band', () => {
    assert.match(COUNTER_SECTION, /\bgap-3\b/);
    assert.match(COUNTER_SECTION, /\brounded-2xl\b/);
    assert.doesNotMatch(COUNTER_SECTION, /border-b|divide-y/);
    assert.match(COUNTER_PANEL, /\bgap-4\b/);
    assert.equal(COUNTER_RHYTHM.section, 'gap-4');
  });

  it('the field / cta / row faces carry radius AND touch together', () => {
    for (const [name, face] of [
      ['COUNTER_FIELD', COUNTER_FIELD],
      ['COUNTER_CTA', COUNTER_CTA],
      ['COUNTER_ROW', COUNTER_ROW],
    ] as const) {
      assert.match(face, /\brounded-(lg|xl|2xl)\b/, `${name} radius`);
      assert.match(face, /\bmin-h-1[24]\b/, `${name} touch height`);
    }
    assert.match(COUNTER_FIELD, /\btext-base\b/);
  });
});
