import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clearSelection,
  extendTo,
  selectAll,
  selectOnlyAt,
  stepCursor,
  toggleAt,
  type SelectionAnchorState,
} from './selection-anchor';

const ROWS = [10, 20, 30, 40, 50] as const;

function state(
  selected: readonly number[] = [],
  anchorId: number | null = null,
  ids: readonly number[] = ROWS,
): SelectionAnchorState {
  return { ids, selected: new Set(selected), anchorId };
}

function sorted(result: { selected: ReadonlySet<number> }): number[] {
  return [...result.selected].sort((a, b) => a - b);
}

describe('toggleAt', () => {
  it('adds an unchecked row and moves the anchor onto it', () => {
    const out = toggleAt(state(), 30);
    assert.deepEqual(sorted(out), [30]);
    assert.equal(out.anchorId, 30);
    assert.equal(out.changed, true);
  });

  it('removes a checked row', () => {
    const out = toggleAt(state([20, 30]), 30);
    assert.deepEqual(sorted(out), [20]);
  });
});

describe('extendTo', () => {
  it('fills the span between the anchor and the target', () => {
    const out = extendTo(state([20], 20), 40);
    assert.deepEqual(sorted(out), [20, 30, 40]);
  });

  it('fills the span when the operator walks BACKWARDS from the anchor', () => {
    const out = extendTo(state([40], 40), 20);
    assert.deepEqual(sorted(out), [20, 30, 40]);
  });

  it('CLEARS the span when the target is already checked', () => {
    // The rule the docblock states: the span takes the TARGET's new state, not
    // the anchor's. Deriving it from the anchor would make range-deselect
    // inexpressible — shift-clicking inside a checked block would refill it.
    const out = extendTo(state([10, 20, 30, 40], 10), 40);
    assert.deepEqual(sorted(out), []);
  });

  it('moves the anchor onto the target so a second extend grows by one', () => {
    const first = extendTo(state([20], 20), 30);
    assert.equal(first.anchorId, 30);
    const second = extendTo(
      { ids: ROWS, selected: first.selected, anchorId: first.anchorId },
      40,
    );
    assert.deepEqual(sorted(second), [20, 30, 40]);
  });

  it('falls back to a plain toggle when there is no anchor to measure from', () => {
    const out = extendTo(state([], null), 30);
    assert.deepEqual(sorted(out), [30]);
    assert.equal(out.anchorId, 30);
  });

  it('falls back to a plain toggle when the anchor has left the view', () => {
    // A filter narrowed between the two clicks. A silent no-op here is worse
    // than a toggle: the operator sees nothing happen on a gesture they trust.
    const out = extendTo(state([99], 99), 30);
    assert.deepEqual(sorted(out).includes(30), true);
  });

  it('always changes something — the target sits in its own span and always flips', () => {
    // Pinned because the module DELETED a `changed` counter here as unreachable.
    // If a future edit reintroduces a no-op branch, one of these fails loudly
    // rather than the branch quietly rotting.
    const cases: SelectionAnchorState[] = [
      { ids: ROWS, selected: new Set(), anchorId: 10 },
      { ids: ROWS, selected: new Set([...ROWS]), anchorId: 10 },
      { ids: ROWS, selected: new Set([30]), anchorId: 10 },
      { ids: ROWS, selected: new Set([10, 20]), anchorId: 50 },
    ];
    for (const before of cases) {
      for (const target of ROWS) {
        if (target === before.anchorId) continue;
        const out = extendTo(before, target);
        assert.equal(out.changed, true);
        assert.notEqual(
          out.selected.has(target),
          before.selected.has(target),
          `target ${target} must flip`,
        );
      }
    }
  });

  it('leaves rows OUTSIDE the span untouched', () => {
    const out = extendTo(state([50], 20), 30);
    assert.deepEqual(sorted(out), [20, 30, 50]);
  });
});

describe('selectOnlyAt', () => {
  it('replaces the whole set', () => {
    const out = selectOnlyAt(state([10, 20, 30]), 40);
    assert.deepEqual(sorted(out), [40]);
  });

  it('is a no-op — same set object — when the row is already the sole selection', () => {
    const before = state([40]);
    const out = selectOnlyAt(before, 40);
    assert.equal(out.changed, false);
    assert.equal(out.selected, before.selected);
  });
});

describe('selectAll / clearSelection', () => {
  it('checks every row in DISPLAY order, not the collection', () => {
    const out = selectAll(state([], null, [30, 10]));
    assert.deepEqual(sorted(out), [10, 30]);
  });

  it('select-all is a no-op when everything is already checked', () => {
    const before = state([...ROWS]);
    assert.equal(selectAll(before).changed, false);
  });

  it('clear drops the anchor with the set', () => {
    const out = clearSelection(state([10, 20], 20));
    assert.deepEqual(sorted(out), []);
    assert.equal(out.anchorId, null);
  });

  it('clear is a no-op on an empty selection', () => {
    assert.equal(clearSelection(state()).changed, false);
  });
});

describe('stepCursor', () => {
  it('walks forward and back in display order', () => {
    assert.equal(stepCursor(ROWS, 20, 1), 30);
    assert.equal(stepCursor(ROWS, 30, -1), 20);
  });

  it('CLAMPS at both ends — a held arrow must never wrap', () => {
    assert.equal(stepCursor(ROWS, 50, 1), 50);
    assert.equal(stepCursor(ROWS, 10, -1), 10);
  });

  it('opens at the first row forward and the last row backward from cold', () => {
    assert.equal(stepCursor(ROWS, null, 1), 10);
    assert.equal(stepCursor(ROWS, null, -1), 50);
  });

  it('re-enters the list when the cursor row has been filtered away', () => {
    assert.equal(stepCursor(ROWS, 99, 1), 10);
  });

  it('has nowhere to go in an empty view', () => {
    assert.equal(stepCursor([], null, 1), null);
  });
});
