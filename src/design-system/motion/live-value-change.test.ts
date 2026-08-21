/**
 *   npx tsx --test src/design-system/motion/live-value-change.test.ts
 *
 * The predicate half of the live-change pulse. It is tested apart from the hook
 * because every false positive here is a lie told to an operator — a chip that
 * flashes "something just changed" when nothing did. On a scan floor that is
 * worse than no animation: the whole point of the pulse is that it is rare
 * enough to trust.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LIVE_VALUE_CHANGE_ATTR,
  LIVE_VALUE_CHANGE_MARK_MS,
  shouldPulseLiveValue,
} from './use-live-value-change';
import { motionRole } from './roles';

describe('shouldPulseLiveValue', () => {
  it('pulses when a mounted chip swaps one label for another', () => {
    assert.equal(shouldPulseLiveValue('PENDING', 'TESTED'), true);
    assert.equal(shouldPulseLiveValue('TESTED', 'PACKED'), true);
  });

  it('does not pulse on the first observation — a mount is not a change', () => {
    // The virtualizer keys rows by record id, so scrolling a row into the
    // window mounts it fresh. If mount counted, every scroll would strobe.
    assert.equal(shouldPulseLiveValue(undefined, 'TESTED'), false);
    assert.equal(shouldPulseLiveValue(undefined, null), false);
  });

  it('does not pulse when the same label re-renders', () => {
    // A refetch that moved some OTHER column still re-runs this cell.
    assert.equal(shouldPulseLiveValue('TESTED', 'TESTED'), false);
  });

  it('pulses a value that APPEARS on a row already on screen', () => {
    // `null → 'Station 2'` is the pack bench a tracking scan just assigned. The
    // chip element is new; the ROW the operator is looking at is not, which is
    // the distinction that decides whether this is news.
    assert.equal(shouldPulseLiveValue(null, 'Station 2'), true);
  });

  it('does not pulse a value vanishing into the empty cell', () => {
    // The cell falls back to the em dash, so there is no chip left to animate.
    assert.equal(shouldPulseLiveValue('TESTED', null), false);
    assert.equal(shouldPulseLiveValue(null, null), false);
  });

  it('treats an empty string as a value, not as absent', () => {
    // `GridStatusCellValue` dashes out on falsy labels, so '' never reaches a
    // mounted chip — but the predicate must not quietly widen `== null` to
    // cover it, or a real '' → 'TESTED' transition elsewhere would go dark.
    assert.equal(shouldPulseLiveValue('', 'TESTED'), true);
    assert.equal(shouldPulseLiveValue('TESTED', ''), true);
  });
});

describe('live-change physics', () => {
  it('keeps the row-wash mark alive longer than the chip pulse', () => {
    // The wash is driven by `[data-order-row-id]:has([data-live-value-change])`
    // in globals.css. If the attribute were pulled at the end of the pulse the
    // wash would cut out mid-fade, which reads as a glitch rather than a decay.
    const pulseMs = motionRole.feedback.liveChange.transition.duration * 1000;
    assert.ok(
      LIVE_VALUE_CHANGE_MARK_MS > pulseMs,
      `mark ${LIVE_VALUE_CHANGE_MARK_MS}ms must outlast the ${pulseMs}ms pulse`,
    );
  });

  it('stays a one-shot inside the house sub-500ms ceiling', () => {
    assert.ok(motionRole.feedback.liveChange.transition.duration < 0.5);
    assert.ok(motionRole.feedback.liveChange.morph.duration < 0.5);
  });

  it('maps every keyframe stop the call sites emit', () => {
    // The hook hands `animate()` 6-value arrays for the double pulse and
    // 3-value arrays for the morph. Motion requires `times.length` to match,
    // and a mismatch throws at runtime on a surface nobody is watching.
    assert.equal(motionRole.feedback.liveChange.transition.times.length, 6);
    assert.equal(motionRole.feedback.liveChange.morph.times.length, 3);
  });

  it('names the attribute the stylesheet selects on', () => {
    assert.equal(LIVE_VALUE_CHANGE_ATTR, 'data-live-value-change');
  });
});
