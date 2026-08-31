import assert from 'node:assert/strict';
import test from 'node:test';

import { repairToItemRecords } from '@/lib/item-record/repair-item-record';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

function repair(overrides: Partial<RSRecord> = {}): RSRecord {
  return {
    id: 3365,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ticket_number: '#9735',
    contact_info: '',
    product_title: 'Bose Wave music system',
    price: '149.00',
    issue: 'No power',
    serial_number: 'SN-778',
    status: 'IN_REPAIR',
    ...overrides,
  } as RSRecord;
}

test('a repair is one device in hand', () => {
  const [row] = repairToItemRecords(repair());
  assert.equal(row.title, 'Bose Wave music system');
  assert.deepEqual(row.quantity, { counted: 1, expected: 1 });
  assert.deepEqual(row.serials, ['SN-778']);
});

test('the fault text is never fed to the grade chip', () => {
  // `issue` is free text ("No power"); the condition registry cannot resolve a
  // hue for it, and pretending it is a grade code would ask it to try.
  assert.equal(repairToItemRecords(repair())[0].conditionGrade, null);
});

test('the repair quote is not a unit price', () => {
  assert.equal(repairToItemRecords(repair({ price: '149.00' }))[0].unitPrice, null);
});

test('title falls back through sku then ticket then id', () => {
  assert.equal(
    repairToItemRecords(repair({ product_title: '', source_sku: 'RS-1' }))[0].title,
    'RS-1',
  );
  assert.equal(
    repairToItemRecords(repair({ product_title: '', source_sku: '' }))[0].title,
    '#9735',
  );
  assert.equal(
    repairToItemRecords(repair({ product_title: '', source_sku: '', ticket_number: '' }))[0].title,
    'Repair 3365',
  );
});

test('a repair with no serial captured yet renders an empty list, not a waiver', () => {
  const [row] = repairToItemRecords(repair({ serial_number: '' }));
  assert.deepEqual(row.serials, []);
  assert.equal(row.serialAbsent, undefined);
});
