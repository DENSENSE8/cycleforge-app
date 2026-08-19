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
  test('matched → empty overflow', () => {
    assert.deepEqual(stationDisplaysFloorMoreItems({ unfound: false }), []);
  });

  test('unfound → Resolve in overflow', () => {
    assert.deepEqual(stationDisplaysFloorMoreItems({ unfound: true }), [
      { key: 'link', label: 'Resolve' },
    ]);
  });
});

describe('cartonFloorPeerOrder', () => {
  test('Unbox — Print + Sync is 5 peers', () => {
    assert.deepEqual(cartonFloorPeerOrder({ print: true, sync: true }), [
      'more',
      'sync',
      'print',
      'edit',
      'delete',
    ]);
  });

  test('Arrival — Sync only is 4 peers (no Print)', () => {
    assert.deepEqual(cartonFloorPeerOrder({ sync: true }), [
      'more',
      'sync',
      'edit',
      'delete',
    ]);
  });

  test('Testing — neither slot is 3 peers (no Print / no Sync)', () => {
    assert.deepEqual(cartonFloorPeerOrder({}), [
      'more',
      'edit',
      'delete',
    ]);
  });
});

describe('cartonDeleteFace / cartonDeleteLabels', () => {
  test('tracking last-8 wins', () => {
    assert.equal(
      cartonDeleteFace({
        receivingId: 9,
        tracking: '9400111899223197428490',
        poNumber: 'PO-1',
      }),
      '97428490',
    );
  });

  test('PO when tracking empty', () => {
    assert.equal(
      cartonDeleteFace({ receivingId: 9, tracking: '', poNumber: 'PO-4411' }),
      'PO-4411',
    );
  });

  test('carton id fallback', () => {
    assert.equal(cartonDeleteFace({ receivingId: 44 }), 'carton 44');
  });

  test('labels name the face', () => {
    const labels = cartonDeleteLabels('1Z999');
    assert.equal(labels.idleLabel, 'Delete 1Z999');
    assert.equal(labels.confirmLabel, 'Click again to delete 1Z999');
    assert.equal(labels.deletedTitle, '1Z999 deleted');
  });
});

describe('cartonInventoryRefreshFeedback', () => {
  test('ok result → success with dossier description', () => {
    assert.deepEqual(cartonInventoryRefreshFeedback({ ok: true, zohoNotes: null }), {
      kind: 'success',
      title: 'Inventory refreshed',
      description: 'Pulled latest status, notes, and lines from inventory.',
    });
  });

  test('failed but painted → warning with error', () => {
    assert.deepEqual(
      cartonInventoryRefreshFeedback({
        ok: false,
        painted: true,
        error: 'Zoho timed out',
      }),
      {
        kind: 'warning',
        title: 'Inventory status updated locally',
        description: 'Zoho timed out',
      },
    );
  });

  test('failed unpainted → error with error', () => {
    assert.deepEqual(
      cartonInventoryRefreshFeedback({ ok: false, error: 'HTTP 500' }),
      {
        kind: 'error',
        title: 'Inventory refresh failed',
        description: 'HTTP 500',
      },
    );
  });

  test('void / non-object result → plain success (no description)', () => {
    assert.deepEqual(cartonInventoryRefreshFeedback(undefined), {
      kind: 'success',
      title: 'Inventory refreshed',
    });
  });
});
