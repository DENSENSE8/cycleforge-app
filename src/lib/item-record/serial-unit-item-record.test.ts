import assert from 'node:assert/strict';
import test from 'node:test';

import {
  serialUnitToItemRecords,
  type SerialUnitRecordSource,
} from '@/lib/item-record/serial-unit-item-record';

function unit(overrides: Partial<SerialUnitRecordSource> = {}): SerialUnitRecordSource {
  return {
    id: 2451,
    serial_number: '024644912010195BC',
    normalized_serial: '024644912010195BC',
    sku: '00123-WH',
    sku_catalog_id: null,
    current_status: 'RECEIVED',
    current_location: 'RACK-A1',
    condition_grade: 'A',
    origin_source: null,
    origin_receiving_line_id: null,
    received_at: null,
    received_by: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    product_title: 'Bose Wave Music System IV Black',
    received_by_name: null,
    ...overrides,
  };
}

// ── shape ───────────────────────────────────────────────────────────────────

test('a unit maps to exactly one item record', () => {
  const rows = serialUnitToItemRecords(unit());
  assert.equal(rows.length, 1, 'a serial unit is one physical thing');
  assert.equal(rows[0].id, 2451);
  assert.equal(rows[0].receiveState, undefined, 'serial-unit 1/1 is not PO receive');
});

test('the product title leads, and carries the sku + grade code', () => {
  const [row] = serialUnitToItemRecords(unit());
  assert.equal(row.title, 'Bose Wave Music System IV Black');
  assert.equal(row.sku, '00123-WH');
  assert.equal(row.conditionGrade, 'A', 'the CODE, not a label — the chip resolves copy');
});

// ── the title fallback ladder ───────────────────────────────────────────────

test('with no product title it falls back to the sku', () => {
  const [row] = serialUnitToItemRecords(unit({ product_title: null }));
  assert.equal(row.title, '00123-WH');
});

test('with no title and no sku it falls back to the serial the operator typed', () => {
  const [row] = serialUnitToItemRecords(unit({ product_title: null, sku: null }));
  assert.equal(row.title, '024644912010195BC');
});

test('a unit with no identity at all still renders a title, never an empty row', () => {
  const [row] = serialUnitToItemRecords(
    unit({ product_title: null, sku: null, serial_number: '' }),
  );
  assert.equal(row.title, 'Unit 2451');
});

// ── quantity ────────────────────────────────────────────────────────────────

test('a unit is one item and it is here — 1 of 1', () => {
  const [row] = serialUnitToItemRecords(unit());
  assert.deepEqual(row.quantity, { counted: 1, expected: 1 });
});

// ── serials ─────────────────────────────────────────────────────────────────

test("the unit's own serial fills the serials track", () => {
  const [row] = serialUnitToItemRecords(unit());
  assert.deepEqual(row.serials, ['024644912010195BC']);
});

test('a missing serial is an empty list, NOT an operator waiver', () => {
  // `serialAbsent` means "this item has no serial" — a decision someone made.
  // An uncaptured serial is a different claim and must render as an em dash.
  const [row] = serialUnitToItemRecords(unit({ serial_number: '' }));
  assert.deepEqual(row.serials, []);
  assert.equal(row.serialAbsent, undefined);
});

// ── empties are honest, not omitted ─────────────────────────────────────────

test('blank sku and grade become null rather than empty strings', () => {
  const [row] = serialUnitToItemRecords(unit({ sku: '   ', condition_grade: '  ' }));
  assert.equal(row.sku, null);
  assert.equal(row.conditionGrade, null);
});

test('no price is invented — the payload carries none', () => {
  assert.equal(serialUnitToItemRecords(unit())[0].unitPrice, null);
});

// ── the photo is the surface's to resolve ───────────────────────────────────

test('no image by default — photos are a sibling array the surface resolves', () => {
  assert.equal(serialUnitToItemRecords(unit())[0].imageUrl, null);
});

test('the surface can pass the leading photo through', () => {
  const [row] = serialUnitToItemRecords(unit(), { imageUrl: ' https://x/p.jpg ' });
  assert.equal(row.imageUrl, 'https://x/p.jpg', 'trimmed');
});

test('a blank image url is null, not an empty src', () => {
  assert.equal(serialUnitToItemRecords(unit(), { imageUrl: '   ' })[0].imageUrl, null);
});
