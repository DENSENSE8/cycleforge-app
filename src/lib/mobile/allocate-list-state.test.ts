import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  allocateSlaLabel,
  parseAllocateDensity,
  parseAllocateSort,
  sortAllocateRows,
} from './allocate-list-state';

const row = (entityId: number, over: Partial<WorkOrderRow> = {}): WorkOrderRow => ({
  id: `ORDER:${entityId}`,
  entityType: 'ORDER',
  entityId,
  queueKey: 'orders',
  queueLabel: 'Orders',
  title: `Order ${entityId}`,
  subtitle: '',
  recordLabel: String(entityId),
  sourcePath: `/m/orders/${entityId}`,
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
  ...over,
});

test('allocate preferences reject unknown stored values', () => {
  assert.equal(parseAllocateSort('quantity'), 'quantity');
  assert.equal(parseAllocateSort('unknown'), 'sla');
  assert.equal(parseAllocateDensity('comfortable'), 'comfortable');
  assert.equal(parseAllocateDensity('huge'), 'high');
});

test('allocate sorts quantity descending with a stable entity tie-break', () => {
  const sorted = sortAllocateRows([
    row(3, { quantity: '1' }),
    row(2, { quantity: '2' }),
    row(1, { quantity: '2' }),
  ], 'quantity');
  assert.deepEqual(sorted.map((item) => item.entityId), [1, 2, 3]);
});

test('exact SLA is relative while a date-only SLA keeps its supplied civil label', () => {
  assert.equal(
    allocateSlaLabel('2026-09-30T13:00:00.000Z', 'Due Sep 30', Date.parse('2026-09-30T12:00:00.000Z')),
    '1h remaining',
  );
  assert.equal(
    allocateSlaLabel('2026-10-03T12:00:00.000Z', 'Due Oct 3', Date.parse('2026-09-30T12:00:00.000Z')),
    '3d remaining',
  );
  assert.equal(
    allocateSlaLabel('2026-09-27T12:00:00.000Z', 'Late', Date.parse('2026-09-30T12:00:00.000Z')),
    'Late 3d',
  );
  assert.equal(allocateSlaLabel('2099-09-30', 'Due Sep 30', Date.parse('2099-09-29T12:00:00.000Z')), 'Due Sep 30');
});
