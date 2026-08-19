/**
 * Unit tests for Station Displays carton Macro floor actions.
 *
 * Run: `node --test --import tsx src/lib/receiving/station-displays-carton-floor.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  cartonDeleteFace,
  cartonDeleteLabels,
  cartonFloorPeerOrder,
  cartonInventoryRefreshFeedback,
  stationDisplaysFloorMoreItems,
  stationDisplaysFloorPrimaryAction,
} from './station-displays-carton-floor';

describe('stationDisplaysFloorPrimaryAction', () => {
  test('matched carton → Print', () => {
    const primary = stationDisplaysFloorPrimaryAction({ unfound: false });
    assert.equal(primary.key, 'print');
    assert.equal(primary.label, 'Print');
  });

  test('unfound → Resolve (not Open Unbox)', () => {
    const primary = stationDisplaysFloorPrimaryAction({ unfound: true });
    assert.equal(primary.key, 'link');
    assert.equal(primary.label, 'Resolve');
  });
});

describe('stationDisplaysFloorMoreItems', () => {
  test('matched → Delete only (the menu is never empty)', () => {
    assert.deepEqual(
      stationDisplaysFloorMoreItems({ unfound: false, deleteLabel: 'Delete 12345678' }),
      [{ key: 'delete', label: 'Delete 12345678', tone: 'danger' }],
    );
  });

  test('unfound → Resolve, then Delete last', () => {
    assert.deepEqual(
      stationDisplaysFloorMoreItems({ unfound: true, deleteLabel: 'Delete PO-9' }),
      [
        { key: 'link', label: 'Resolve' },
        { key: 'delete', label: 'Delete PO-9', tone: 'danger' },
      ],
    );
  });

  test('Delete is always last, so the destructive row never moves', () => {
    for (const unfound of [true, false]) {
      const items = stationDisplaysFloorMoreItems({ unfound, deleteLabel: 'Delete x' });
      assert.equal(items[items.length - 1]!.key, 'delete');
      assert.equal(items[items.length - 1]!.tone, 'danger');
    }
  });
});

describe('cartonFloorPeerOrder', () => {
  test('Unbox — Refresh + Print is 4 cells', () => {
    assert.deepEqual(cartonFloorPeerOrder({ print: true, sync: true }), [
      'sync',
      'print',
      'edit',
      'more',
    ]);
  });

  test('Arrival — Refresh only is 3 cells (no Print)', () => {
    assert.deepEqual(cartonFloorPeerOrder({ sync: true }), ['sync', 'edit', 'more']);
  });

  test('Testing — neither slot is 2 cells (no Print / no Refresh)', () => {
    assert.deepEqual(cartonFloorPeerOrder({}), ['edit', 'more']);
  });

  test('⋮ is last on every station, so it anchors one corner', () => {
    for (const slots of [{ print: true, sync: true }, { sync: true }, { print: true }, {}]) {
      const peers = cartonFloorPeerOrder(slots);
      assert.equal(peers[peers.length - 1], 'more');
    }
  });

  test('Delete is never a peer — it lives inside ⋮', () => {
    for (const slots of [{ print: true, sync: true }, {}]) {
      assert.ok(!cartonFloorPeerOrder(slots).includes('delete' as never));
    }
  });
});
