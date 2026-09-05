/**
 * Escape precedence: overlay → live selection → record cursor.
 *
 *   npx tsx --test src/lib/selection/selection-liveness.test.ts
 *
 * The signal is one boolean. What it protects is the ORDER, and the order is
 * only correct if a yielding layer returns without `preventDefault` — see the
 * module docblock.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  hasLiveTableSelection,
  releaseLiveSelection,
  resetLiveSelectionForTest,
  setLiveSelectionCount,
} from './selection-liveness';

beforeEach(() => resetLiveSelectionForTest());

describe('selection liveness', () => {
  it('is false with nothing checked', () => {
    assert.equal(hasLiveTableSelection(), false);
    setLiveSelectionCount('orders', 0);
    assert.equal(hasLiveTableSelection(), false);
  });

  it('is true while any scope has rows checked', () => {
    setLiveSelectionCount('orders', 3);
    assert.equal(hasLiveTableSelection(), true);
  });

  it('a scope publishing zero drops out — a count is replaced, never accumulated', () => {
    // Ref-counting would drift on a remount, where two effects for one scope
    // briefly overlap. The last value for a scope is the truth.
    setLiveSelectionCount('orders', 3);
    setLiveSelectionCount('orders', 3);
    setLiveSelectionCount('orders', 0);
    assert.equal(hasLiveTableSelection(), false);
  });

  it('one desk clearing does not release another desk still holding rows', () => {
    setLiveSelectionCount('orders', 2);
    setLiveSelectionCount('repair', 5);
    setLiveSelectionCount('orders', 0);
    assert.equal(hasLiveTableSelection(), true);
    setLiveSelectionCount('repair', 0);
    assert.equal(hasLiveTableSelection(), false);
  });

  it('an unmounting table releases its scope — no phantom holding Escape', () => {
    // Without this, navigating away from a desk with rows checked leaves the
    // record cursor yielding Escape forever on every surface after it.
    setLiveSelectionCount('orders', 4);
    releaseLiveSelection('orders');
    assert.equal(hasLiveTableSelection(), false);
  });
});
