import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { resolveAllocatePresentation } from './allocate-presentation';

function row(over: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    id: 'ORDER:42', entityType: 'ORDER', entityId: 42, queueKey: 'orders', queueLabel: 'Orders',
    title: 'Bike', subtitle: '', recordLabel: '#42', sourcePath: '/orders/42', techId: null,
    techName: null, packerId: null, packerName: null, status: 'OPEN', priority: 100,
    deadlineAt: null, notes: null, assignedAt: null, updatedAt: null, orderId: 'AMZ-42',
    quantity: '2', condition: 'NEW', saleAmount: '199.99', currency: 'USD', ...over,
  };
}

test('projects compact and disclosed Allocate facts from one model', () => {
  const model = resolveAllocatePresentation(row(), Date.now());
  assert.equal(model.orderReference, 'AMZ-42');
  assert.equal(model.quantityDisplay, '×2');
  assert.equal(model.condition, 'New');
  assert.equal(model.price, '$199.99');
  assert.equal(model.location, null);
  assert.equal(model.primary.label, 'Scan and assign');
});

test('uses the assigned location and shortage state to choose the next safe verb', () => {
  const located = resolveAllocatePresentation(row({ storageLocations: [{ barcode: 'A-01' }] }), Date.now());
  assert.equal(located.primary.label, 'Start pick');
  const short = resolveAllocatePresentation(row({ outOfStock: 'Out of stock' }), Date.now());
  assert.equal(short.primary.label, 'Resolve shortage');
});
