import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RECEIVING_TYPES,
  receivingTypeMeta,
} from './receiving-type-meta';
import { receivingLabelTypeDisplay } from './receiving-type-display';

test('built-in types include Repair with a wrench icon', () => {
  const repair = RECEIVING_TYPES.find((t) => t.value === 'REPAIR');
  assert.ok(repair);
  assert.equal(repair?.icon, 'wrench');
  assert.equal(repair?.label, 'Repair');
});

test('receivingTypeMeta is case-insensitive', () => {
  assert.equal(receivingTypeMeta('trade_in').value, 'TRADE_IN');
  assert.equal(receivingTypeMeta('Return').short, 'Ret');
});

test('receivingLabelTypeDisplay mirrors the meta label', () => {
  assert.equal(receivingLabelTypeDisplay('REPAIR'), 'Repair');
  assert.equal(receivingLabelTypeDisplay('PO'), 'Purchase order');
  assert.equal(receivingLabelTypeDisplay(''), '');
});

test('unknown type keeps the raw code as label', () => {
  assert.equal(receivingTypeMeta('CUSTOM_FLOW').label, 'CUSTOM FLOW');
});
