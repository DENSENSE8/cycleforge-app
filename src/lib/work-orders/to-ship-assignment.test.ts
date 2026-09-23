/**
 *   npx tsx --test src/lib/work-orders/to-ship-assignment.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  filterToShipByQuery,
  filterToShipByPlatform,
  filterToShipByOrderView,
  filterToShipByTab,
  isAssignedToShipRow,
  isToShipOutOfStock,
  mobileProcessOrderHref,
  parseMobileToShipTab,
  toShipOrderId,
  toShipTrackingNumber,
  toShipAssigneeLabel,
  toShipPickerLabel,
  toShipPackerLabel,
  toShipGivenName,
  parseMobileToShipSort,
  parseMobileOrderView,
  sortToShipRows,
} from './to-ship-assignment';

describe('mobile warehouse order views', () => {
  const today = '2026-09-16';
  const rows = [
    row({ entityId: 1, deadlineAt: today }),
    row({ entityId: 2, isUrgent: true }),
    row({ entityId: 3, outOfStock: 'Out of stock' }),
    row({ entityId: 4, shipmentId: 44, hasTechScan: true }),
    row({ entityId: 5, shipmentId: 55, hasTechScan: true, packedAt: today }),
  ];

  it('parses only governed views', () => {
    assert.equal(parseMobileOrderView('ready-to-pack'), 'ready-to-pack');
    assert.equal(parseMobileOrderView('anything'), 'all');
  });

  it('derives each view from shared deadline and lifecycle facts', () => {
    assert.deepEqual(filterToShipByOrderView(rows, 'must-go-today', today).map((r) => r.entityId), [1]);
    assert.deepEqual(filterToShipByOrderView(rows, 'urgent', today).map((r) => r.entityId), [2]);
    assert.deepEqual(filterToShipByOrderView(rows, 'blocked', today).map((r) => r.entityId), [3]);
    assert.deepEqual(filterToShipByOrderView(rows, 'ready-to-pack', today).map((r) => r.entityId), [4]);
    assert.deepEqual(filterToShipByOrderView(rows, 'packed', today).map((r) => r.entityId), [5]);
  });
});

function row(over: Partial<WorkOrderRow> & { entityId: number }): WorkOrderRow {
  return {
    id: `ORDER:${over.entityId}`,
    entityType: 'ORDER',
    queueKey: 'orders',
    queueLabel: 'Orders',
    title: 'Bike',
    subtitle: '',
    recordLabel: `#${over.entityId}`,
    sourcePath: '/m/orders/1',
    techId: null,
    techName: null,
    packerId: null,
    packerName: null,
    status: 'OPEN',
    priority: 100,
    deadlineAt: null,
    notes: null,
    assignedAt: null,
    updatedAt: null,
    orderId: String(over.entityId),
    ...over,
  };
}

describe('parseMobileToShipTab', () => {
  it('defaults unknown and missing to all', () => {
    assert.equal(parseMobileToShipTab(null), 'all');
    assert.equal(parseMobileToShipTab('nope'), 'all');
    assert.equal(parseMobileToShipTab('assigned'), 'assigned');
    assert.equal(parseMobileToShipTab('unassigned'), 'unassigned');
  });
});

describe('filterToShipByTab', () => {
  const assigned = row({ entityId: 1, packerId: 9 });
  const unassigned = row({ entityId: 2 });

  it('splits assigned vs unassigned; all keeps both', () => {
    assert.equal(isAssignedToShipRow(assigned), true);
    assert.equal(isAssignedToShipRow(unassigned), false);
    assert.deepEqual(
      filterToShipByTab([assigned, unassigned], 'all').map((r) => r.entityId),
      [1, 2],
    );
    assert.deepEqual(
      filterToShipByTab([assigned, unassigned], 'assigned').map((r) => r.entityId),
      [1],
    );
    assert.deepEqual(
      filterToShipByTab([assigned, unassigned], 'unassigned').map((r) => r.entityId),
      [2],
    );
  });
});

describe('filterToShipByPlatform', () => {
  it('filters by the connected marketplace without case-sensitive drift', () => {
    const amazon = row({ entityId: 1, accountSource: 'Amazon' });
    const ecwid = row({ entityId: 2, accountSource: 'Ecwid' });
    assert.deepEqual(filterToShipByPlatform([amazon, ecwid], 'amazon').map((entry) => entry.entityId), [1]);
    assert.deepEqual(filterToShipByPlatform([amazon, ecwid], 'ALL').map((entry) => entry.entityId), [1, 2]);
  });
});

describe('mobileProcessOrderHref', () => {
  it('opens the per-order pick/pack surface', () => {
    assert.equal(mobileProcessOrderHref({ entityId: 42 }), '/m/id/pick/42');
  });
});

describe('toShipOrderId / toShipTrackingNumber', () => {
  it('prefers marketplace order id and trims tracking', () => {
    assert.equal(
      toShipOrderId({ orderId: '  12-34567890  ', recordLabel: '#9', entityId: 9 }),
      '12-34567890',
    );
    assert.equal(toShipTrackingNumber({ trackingNumber: '  1Z999  ' }), '1Z999');
    assert.equal(toShipTrackingNumber({ trackingNumber: '  ' }), null);
  });
});

describe('toShipAssigneeLabel / sortToShipRows', () => {
  it('keeps picker and packer as separate names; sort still prefers packer', () => {
    assert.equal(
      toShipPickerLabel({ techName: 'Alex Pick', techId: 2 }),
      'Alex Pick',
    );
    assert.equal(
      toShipPackerLabel({ packerName: 'Pat Pack', packerId: 1 }),
      'Pat Pack',
    );
    assert.equal(toShipGivenName('Pat Pack'), 'Pat');
    assert.equal(
      toShipAssigneeLabel({ packerName: 'Pat Pack', techName: 'Terry', packerId: 1, techId: 2 }),
      'Pat Pack',
    );
    assert.equal(
      toShipAssigneeLabel({ packerName: null, techName: null, packerId: 7, techId: null }, (id) =>
        id === 7 ? 'Riley' : '---',
      ),
      'Riley',
    );
    assert.equal(parseMobileToShipSort('assignee'), 'assignee');
    assert.equal(parseMobileToShipSort('title'), 'title');
    assert.equal(parseMobileToShipSort('nope'), 'deadline');
  });

  it('sorts unassigned last when sorting by assignee', () => {
    const pat = row({ entityId: 2, packerName: 'Pat' });
    const open = row({ entityId: 1 });
    assert.deepEqual(
      sortToShipRows([open, pat], 'assignee').map((r) => r.entityId),
      [2, 1],
    );
  });

  it('sorts product titles A to Z', () => {
    const zebra = row({ entityId: 1, title: 'Zebra frame' });
    const apple = row({ entityId: 2, title: 'apple stem' });
    assert.deepEqual(
      sortToShipRows([zebra, apple], 'title').map((r) => r.entityId),
      [2, 1],
    );
  });
});

describe('filterToShipByQuery / isToShipOutOfStock', () => {
  it('matches title, marketplace id, tracking, sku, and item number', () => {
    const hit = row({
      entityId: 9,
      title: 'Trail bike',
      orderId: '12-345678901234',
      trackingNumber: '1Z999AA10123456784',
      sku: 'SKU-1',
      itemNumber: '123456789012',
    });
    const miss = row({ entityId: 8, title: 'Other', orderId: '99-000' });
    assert.deepEqual(
      filterToShipByQuery([hit, miss], '12-345678901234').map((r) => r.entityId),
      [9],
    );
    assert.deepEqual(
      filterToShipByQuery([hit, miss], 'trail').map((r) => r.entityId),
      [9],
    );
    assert.deepEqual(
      filterToShipByQuery([hit, miss], '1Z999').map((r) => r.entityId),
      [9],
    );
    assert.equal(filterToShipByQuery([hit, miss], 'nope').length, 0);
  });

  it('matches product family, condition grade, serial, and picker name', () => {
    const hit = row({
      entityId: 9,
      title: 'Stem',
      catalogCategory: 'Bikes',
      condition: 'USED_A',
      serialNumber: 'SN-4411',
      techName: 'Alex Pick',
      techId: 4,
    });
    const miss = row({ entityId: 8, title: 'Zebra Frame', orderId: '99-000', condition: 'USED_B' });
    assert.deepEqual(filterToShipByQuery([hit, miss], 'bikes').map((r) => r.entityId), [9]);
    assert.deepEqual(filterToShipByQuery([hit, miss], 'used a').map((r) => r.entityId), [9]);
    assert.deepEqual(filterToShipByQuery([hit, miss], 'USED_A').map((r) => r.entityId), [9]);
    assert.deepEqual(filterToShipByQuery([hit, miss], 'A').map((r) => r.entityId), [9]);
    assert.deepEqual(filterToShipByQuery([hit, miss], 'sn-4411').map((r) => r.entityId), [9]);
    assert.deepEqual(filterToShipByQuery([hit, miss], 'alex').map((r) => r.entityId), [9]);
  });

  it('treats a non-empty outOfStock face as blocked', () => {
    assert.equal(isToShipOutOfStock({ outOfStock: 'Out of stock' }), true);
    assert.equal(isToShipOutOfStock({ outOfStock: null }), false);
  });
});
