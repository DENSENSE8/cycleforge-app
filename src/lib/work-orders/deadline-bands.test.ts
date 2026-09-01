/**
 * Deadline banding + homepage preview ranking for `/m/home` and `/m/work`.
 *
 *   npx tsx --test src/lib/work-orders/deadline-bands.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  ASSIGNED_ORDERS_HOME_PREVIEW,
  assignedOrderRows,
  bandWorkOrderRows,
  classifyDeadlineBand,
  mobileAssignedOrderHref,
  takeMostUrgentWorkOrders,
} from './deadline-bands';

const TODAY = '2026-08-31';

function order(over: Partial<WorkOrderRow> & { entityId: number }): WorkOrderRow {
  return {
    id: `ORDER:${over.entityId}`,
    entityType: 'ORDER',
    queueKey: 'orders',
    queueLabel: 'Orders',
    title: `Order ${over.entityId}`,
    subtitle: '',
    recordLabel: `#${over.entityId}`,
    sourcePath: '/dashboard?pending=',
    techId: 1,
    techName: 'Ada',
    packerId: null,
    packerName: null,
    status: 'ASSIGNED',
    priority: 100,
    deadlineAt: null,
    notes: null,
    assignedAt: null,
    updatedAt: null,
    orderId: String(over.entityId),
    ...over,
  };
}

describe('classifyDeadlineBand', () => {
  it('splits overdue / today / upcoming / none on warehouse civil dates', () => {
    assert.equal(classifyDeadlineBand('2026-08-30', TODAY), 'overdue');
    assert.equal(classifyDeadlineBand('2026-08-31', TODAY), 'today');
    assert.equal(classifyDeadlineBand('2026-09-02', TODAY), 'upcoming');
    assert.equal(classifyDeadlineBand(null, TODAY), 'none');
    assert.equal(classifyDeadlineBand('', TODAY), 'none');
  });
});

describe('bandWorkOrderRows', () => {
  it('omits empty bands and sorts overdue first', () => {
    const groups = bandWorkOrderRows(
      [
        order({ entityId: 2, deadlineAt: '2026-09-04' }),
        order({ entityId: 1, deadlineAt: '2026-08-30' }),
      ],
      TODAY,
    );
    assert.deepEqual(
      groups.map((g) => g.band),
      ['overdue', 'upcoming'],
    );
    assert.equal(groups[0].rows[0].entityId, 1);
  });
});

describe('assignedOrderRows', () => {
  it('keeps ORDER rows and drops other work types', () => {
    const repair: WorkOrderRow = {
      ...order({ entityId: 9 }),
      id: 'REPAIR:9',
      entityType: 'REPAIR',
      queueKey: 'repair_services',
    };
    const kept = assignedOrderRows([order({ entityId: 1 }), repair]);
    assert.deepEqual(kept.map((r) => r.entityId), [1]);
  });
});

describe('takeMostUrgentWorkOrders', () => {
  it('takes overdue then today then upcoming, capped at the homepage preview', () => {
    const rows = [
      order({ entityId: 4, deadlineAt: '2026-09-05', priority: 1 }),
      order({ entityId: 3, deadlineAt: '2026-08-31' }),
      order({ entityId: 2, deadlineAt: '2026-08-29' }),
      order({ entityId: 1, deadlineAt: '2026-08-28' }),
    ];
    const preview = takeMostUrgentWorkOrders(rows, ASSIGNED_ORDERS_HOME_PREVIEW, TODAY);
    assert.deepEqual(
      preview.map((r) => r.entityId),
      [1, 2, 3],
    );
  });

  it('returns an empty list when nothing is assigned', () => {
    assert.deepEqual(takeMostUrgentWorkOrders([], 3, TODAY), []);
  });

  it('returns nothing for a non-positive limit', () => {
    assert.deepEqual(
      takeMostUrgentWorkOrders([order({ entityId: 1, deadlineAt: '2026-08-30' })], 0, TODAY),
      [],
    );
  });
});

describe('mobileAssignedOrderHref', () => {
  it('prefers the marketplace order id over the numeric pk', () => {
    assert.equal(
      mobileAssignedOrderHref({ orderId: 'CF-1001', entityId: 7 }),
      '/m/orders/CF-1001',
    );
    assert.equal(mobileAssignedOrderHref({ orderId: null, entityId: 7 }), '/m/orders/7');
  });
});
