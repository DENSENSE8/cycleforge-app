import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFromExtractArgs, parseInboundExtractJson } from './extract-po-llm';

test('pickup paperwork maps receipt and condition facts without inventing an order id', () => {
  const draft = draftFromExtractArgs({
    seller: { value: 'Ken', confidence: 'high' },
    order_date: '2026-09-14',
    payment_method: 'Venmo',
    total_paid_cents: 80_000,
    line_items: [
      {
        item_name: 'Bose bass module 700',
        quantity: 2,
        unit_cost_cents: 13_000,
        condition_grade: 'USED_B',
        parts_status: 'MISSING_PARTS',
        missing_parts_note: 'No power cord',
        condition_note: 'Damaged bottom corner',
      },
    ],
  }, 'PICKUP');

  assert.equal(draft.type, 'PICKUP');
  assert.equal(draft.platform, 'manual');
  assert.equal(draft.orderNumber, '');
  assert.equal(draft.vendor, 'Ken');
  assert.equal(draft.orderDate, '2026-09-14');
  assert.deepEqual(draft.pickup, { paymentMethod: 'VENMO', paidCents: 80_000 });
  assert.deepEqual(
    {
      title: draft.lines[0].title,
      quantity: draft.lines[0].quantity,
      unitCostCents: draft.lines[0].unitCostCents,
      conditionGrade: draft.lines[0].conditionGrade,
      partsStatus: draft.lines[0].partsStatus,
      missingPartsNote: draft.lines[0].missingPartsNote,
      conditionNote: draft.lines[0].conditionNote,
    },
    {
      title: 'Bose bass module 700',
      quantity: 2,
      unitCostCents: 13_000,
      conditionGrade: 'USED_B',
      partsStatus: 'MISSING_PARTS',
      missingPartsNote: 'No power cord',
      conditionNote: 'Damaged bottom corner',
    },
  );
});

test('ordinary PO extraction keeps its original classifier and does not default a platform', () => {
  const draft = draftFromExtractArgs({ line_items: [{ sku: 'ABC', quantity: 1 }] });
  assert.equal(draft.type, 'PO');
  assert.equal(draft.platform, '');
  assert.equal(draft.lines[0].sku, 'ABC');
});

test('a local model JSON response may be wrapped in a markdown fence', () => {
  assert.deepEqual(
    parseInboundExtractJson('```json\n{"seller":{"value":"Ken","confidence":"high"}}\n```'),
    { seller: { value: 'Ken', confidence: 'high' } },
  );
});

test('pickup extraction drops model claims that are not present in the OCR evidence', () => {
  const draft = draftFromExtractArgs({
    platform: { value: 'cycleforge', confidence: 'low' },
    order_id: { value: 's1o7', confidence: 'low' },
    seller: { value: 'CycleForge', confidence: 'low' },
    order_date: '2007-01-01',
    payment_method: 'CASH',
    total_paid_cents: 5_400,
    line_items: [{ item_name: 'Invented speaker', quantity: 1, unit_cost_cents: 5_400 }],
  }, 'PICKUP', 'Seller: Ken\nPayment: VENMO\nTotal Paid: $800.00');

  assert.equal(draft.platform, 'manual');
  assert.equal(draft.orderNumber, '');
  assert.equal(draft.vendor, '');
  assert.equal(draft.orderDate, null);
  assert.deepEqual(draft.pickup, { paymentMethod: '', paidCents: null });
  assert.equal(draft.lines[0].title, '');
  assert.equal(draft.lines[0].unitCostCents, null);
});
