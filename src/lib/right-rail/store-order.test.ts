/**
 *   npx tsx --test src/lib/right-rail/store-order.test.ts
 *
 * The occupancy store stopped being one slot. These pin the two properties the
 * N-tile host depends on and the single-slot host must not lose:
 *
 *  1. `getRightRailTop()` is still exactly the head of the ordered list, so the
 *     43 registrants and the legacy host see no change at all.
 *  2. Both list readers are CACHED. `useSyncExternalStore` compares snapshots
 *     with `Object.is`, so a reader that builds a fresh array per call renders
 *     forever — and the skipping reader has to filter, which is exactly the
 *     shape that tempts you to.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  RIGHT_RAIL_PRIORITY,
  getRightRailOccupants,
  getRightRailOccupantsSkipping,
  getRightRailPanel,
  getRightRailTop,
  getRightRailTopSkipping,
  getServerRightRailOccupants,
  registerRightRailPanel,
} from './store';

const disposers: Array<() => void> = [];

function claim(id: string, priority: number, node: unknown = id) {
  disposers.push(registerRightRailPanel({ id, priority, node: node as never }));
}

beforeEach(() => {
  while (disposers.length > 0) disposers.pop()!();
});

describe('ordered occupancy', () => {
  it('orders by priority, then most-recently-registered', () => {
    claim('detail:a', RIGHT_RAIL_PRIORITY.detail);
    claim('assistant', RIGHT_RAIL_PRIORITY.assistant);
    claim('detail:b', RIGHT_RAIL_PRIORITY.detail);

    assert.deepEqual(
      getRightRailOccupants().map((p) => p.id),
      ['detail:b', 'detail:a', 'assistant'],
    );
  });

  it('getRightRailTop is exactly the head — the shim the legacy host reads', () => {
    claim('assistant', RIGHT_RAIL_PRIORITY.assistant);
    claim('detail:a', RIGHT_RAIL_PRIORITY.detail);

    assert.equal(getRightRailTop()?.id, 'detail:a');
    assert.equal(getRightRailTop(), getRightRailOccupants()[0]);
  });

  it('the skipping readers agree with each other', () => {
    claim('detail:a', RIGHT_RAIL_PRIORITY.detail);
    claim('detail:b', RIGHT_RAIL_PRIORITY.detail);

    assert.equal(getRightRailTopSkipping('detail:b')?.id, 'detail:a');
    assert.deepEqual(
      getRightRailOccupantsSkipping('detail:b').map((p) => p.id),
      ['detail:a'],
    );
    assert.equal(getRightRailTopSkipping(null), getRightRailTop());
    assert.equal(getRightRailOccupantsSkipping(null), getRightRailOccupants());
  });

  it('both list readers hand out a STABLE identity between mutations', () => {
    claim('detail:a', RIGHT_RAIL_PRIORITY.detail);
    claim('detail:b', RIGHT_RAIL_PRIORITY.detail);

    const all = getRightRailOccupants();
    assert.equal(getRightRailOccupants(), all);

    const skipped = getRightRailOccupantsSkipping('detail:b');
    assert.equal(
      getRightRailOccupantsSkipping('detail:b'),
      skipped,
      'the filtered read must be memoized, or useSyncExternalStore loops',
    );

    claim('detail:c', RIGHT_RAIL_PRIORITY.detail);
    assert.notEqual(getRightRailOccupants(), all, 'a mutation must change identity');
    assert.notEqual(getRightRailOccupantsSkipping('detail:b'), skipped);
  });

  it('unregistering is scoped to THIS claim, not to the id', () => {
    const stale = registerRightRailPanel({
      id: 'detail:a',
      priority: RIGHT_RAIL_PRIORITY.detail,
      node: 'first',
    });
    claim('detail:a', RIGHT_RAIL_PRIORITY.detail, 'second');
    stale();

    assert.equal(getRightRailPanel('detail:a')?.node, 'second');
  });

  it('carries the tool key an occupant registered with', () => {
    disposers.push(
      registerRightRailPanel({
        id: 'tool:calculator:1',
        priority: RIGHT_RAIL_PRIORITY.detail,
        node: 'calc',
        toolKey: 'calculator',
      }),
    );
    assert.equal(getRightRailPanel('tool:calculator:1')?.toolKey, 'calculator');
  });

  it('the server snapshot is a frozen constant, never a fresh array', () => {
    assert.equal(getServerRightRailOccupants(), getServerRightRailOccupants());
    assert.deepEqual(getServerRightRailOccupants(), []);
  });
});
