import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TechRecord } from '@/hooks/useDeskPickLogs';
import { techRecordToRailVM } from './tech-record-rail-vm';

const record: TechRecord = {
  id: 1,
  created_at: '2026-07-17T07:00:00Z',
  shipping_tracking_number: '1Z123',
  serial_number: 'SN-1',
  tested_by: 1,
  order_id: 'ORDER-7428',
  product_title: 'Replacement speaker cable',
  quantity: '1',
  condition: 'Used',
  sku: 'SKU-1',
  account_source: 'Amazon',
};

describe('techRecordToRailVM', () => {
  it('renders only title and quantity-condition meta', () => {
    const vm = techRecordToRailVM(record);

    assert.equal(vm.title, 'Replacement speaker cable');
    assert.equal(vm.eyebrow, undefined);
    assert.ok(vm.meta);
  });
});
