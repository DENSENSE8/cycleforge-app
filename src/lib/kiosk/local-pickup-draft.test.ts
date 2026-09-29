import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createKioskPickupDraft,
  kioskPickupReady,
  syncKioskPickupProducts,
} from './local-pickup-draft';

test('kiosk pickup starts as the canonical manual PICKUP draft', () => {
  const draft = createKioskPickupDraft('2026-09-29');
  assert.equal(draft.type, 'PICKUP');
  assert.equal(draft.platform, 'manual');
  assert.equal(draft.orderDate, '2026-09-29');
  assert.deepEqual(draft.lines, []);
  assert.equal(kioskPickupReady(draft), false);
});
test('catalog and manual products become independent pickup lines', () => {
  const draft = syncKioskPickupProducts(createKioskPickupDraft('2026-09-29'), [
    { id: 'catalog:1', name: 'Bose 251', sku: 'BOSE-251', price: 370 },
    { id: 'manual:1', name: 'Remote V20 V10', sku: '', price: null },
  ]);
  assert.deepEqual(
    draft.lines.map((line) => ({ key: line.lineKey, title: line.title, sku: line.sku, cost: line.unitCostCents })),
    [
      { key: 'catalog:1', title: 'Bose 251', sku: 'BOSE-251', cost: 37000 },
      { key: 'manual:1', title: 'Remote V20 V10', sku: '', cost: null },
    ],
  );
});

test('reconciliation preserves triaged facts and removes deselected products', () => {
  let draft = syncKioskPickupProducts(createKioskPickupDraft('2026-09-29'), [
    { id: 'a', name: 'A', sku: 'A', price: 10 },
    { id: 'b', name: 'B', sku: 'B', price: 20 },
  ]);
  draft = {
    ...draft,
    lines: draft.lines.map((line) =>
      line.lineKey === 'b'
        ? { ...line, quantity: 3, conditionGrade: 'USED_B', conditionNote: 'Scuffed' }
        : line,
    ),
  };
  draft = syncKioskPickupProducts(draft, [
    { id: 'b', name: 'B', sku: 'B', price: 20 },
  ]);
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0]?.quantity, 3);
  assert.equal(draft.lines[0]?.conditionGrade, 'USED_B');
  assert.equal(draft.lines[0]?.conditionNote, 'Scuffed');
});
