import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeDogfoodPickupDraft,
  draftFromExtractArgs,
  draftFromUnlimitedOcrPickup,
  parseInboundExtractJson,
} from './extract-po-llm';

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

test('dogfood pickup completion makes a yearless form landable without inventing business facts', () => {
  const draft = draftFromExtractArgs({
    seller: { value: 'Ken', confidence: 'high' },
    payment_method: 'Venmo',
    total_paid_cents: 80_000,
    line_items: [{ item_name: 'Solo 15 TV Sound System' }],
  }, 'PICKUP', 'Seller: Ken\nDate: 9/14\nPayment: Venmo\nTotal Paid: $800\nSolo 15 TV Sound System');

  const completed = completeDogfoodPickupDraft(
    draft,
    'Seller: Ken\nDate: 9/14\nPayment: Venmo\nTotal Paid: $800\nSolo 15 TV Sound System',
    new Date('2026-09-29T12:00:00Z'),
  );

  assert.equal(completed.orderDate, '2026-09-14');
  assert.equal(completed.orderNumber, 'LCPU-KEN-091426');
  assert.equal(completed.lines[0].quantity, 1);
  assert.deepEqual(completed.pickup, { paymentMethod: 'VENMO', paidCents: 80_000 });
});

test('dogfood yearless pickup date rolls back near New Year instead of choosing the future', () => {
  const draft = draftFromExtractArgs({ seller: { value: 'Tan', confidence: 'high' } }, 'PICKUP', 'Seller: Tan\nDate: 12/19');
  const completed = completeDogfoodPickupDraft(draft, 'Seller: Tan\nDate: 12/19', new Date('2026-01-08T12:00:00Z'));
  assert.equal(completed.orderDate, '2025-12-19');
  assert.equal(completed.orderNumber, 'LCPU-TAN-121925');
});

test('Unlimited OCR LCPU table becomes receipt facts and every product row without a second model', () => {
  const draft = draftFromUnlimitedOcrPickup('<table>' +
    '<tr><td>Seller:</td><td>Ken</td><td></td><td>Date:</td><td>9/14</td></tr>' +
    '<tr><td>Payment</td><td>Venmo</td><td></td><td>Total Paid:</td><td>$800</td></tr>' +
    '<tr><td>Grade</td><td>Product Name</td><td>Qty</td><td>Complete/ OR Missing</td><td>Condition Note</td><td>Offer Price</td><td>Total</td></tr>' +
    '<tr><td>A</td><td>Solo 15 TV Sound System</td><td>1</td><td></td><td>Working</td><td></td><td></td></tr>' +
    '<tr><td>B</td><td>SoundTouch Portable</td><td>2</td><td>Speaker only</td><td>Works great</td><td>$60</td><td>$120</td></tr>' +
    '</table>');
  assert.ok(draft);
  assert.equal(draft.vendor, 'Ken');
  assert.deepEqual(draft.pickup, { paymentMethod: 'VENMO', paidCents: 80_000 });
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0].conditionGrade, 'USED_A');
  assert.equal(draft.lines[1].quantity, 2);
  assert.equal(draft.lines[1].unitCostCents, 6_000);
  assert.equal(draft.lines[1].partsStatus, 'MISSING_PARTS');
});
