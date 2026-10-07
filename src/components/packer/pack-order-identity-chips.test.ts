import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePackOrderIdentityChips } from './pack-order-identity-chips';
import type { PackActiveOrderPane } from './usePackerOrderPane';

function pane(partial: Partial<PackActiveOrderPane>): PackActiveOrderPane {
  return {
    orderRowId: 1,
    orderId: '',
    productTitle: 'Test',
    qty: 1,
    condition: 'NEW',
    tracking: '',
    ...partial,
  };
}

test('order# stays in poDisplay — SKU never fills the order chip', () => {
  const chips = resolvePackOrderIdentityChips(
    pane({
      orderId: 'ORD-12345678',
      sku: 'SKU-999',
      tracking: '1Z999AA10123456784',
      scanType: 'ORDERS',
    }),
  );
  assert.equal(chips.poDisplay, 'ORD-12345678');
  assert.equal(chips.tracking, '1Z999AA10123456784');
  assert.notEqual(chips.poDisplay, 'SKU-999');
});

test('missing order# is a dash — never tracking, still never SKU', () => {
  const chips = resolvePackOrderIdentityChips(
    pane({
      orderId: '',
      sku: 'SKU-ONLY',
      tracking: '9400111899223344556677',
      scanType: 'ORDERS',
    }),
  );
  assert.equal(chips.poDisplay, '\u2014');
  assert.notEqual(chips.poDisplay, '9400111899223344556677');
  assert.notEqual(chips.poDisplay, 'SKU-ONLY');
  // Tracking keeps its own chip — the dash replaces the fallback, not the fact.
  assert.equal(chips.tracking, '9400111899223344556677');
});

test('canSendToPhone only when packerLogId is a positive id', () => {
  assert.equal(
    resolvePackOrderIdentityChips(pane({ packerLogId: 42 })).canSendToPhone,
    true,
  );
  assert.equal(
    resolvePackOrderIdentityChips(pane({ packerLogId: null })).canSendToPhone,
    false,
  );
  assert.equal(
    resolvePackOrderIdentityChips(pane({ packerLogId: 0 })).canSendToPhone,
    false,
  );
});

test('eBay 2-5-5 order# fills platform even without a listing-derived key', () => {
  const chips = resolvePackOrderIdentityChips(
    pane({ orderId: '03-15100-78272', sku: '' }),
  );
  assert.equal(chips.platformValue, 'ebay');
});

test('Amazon 3-7-7 order# fills platform over a listing fallback', () => {
  const chips = resolvePackOrderIdentityChips(
    pane({ orderId: '111-1234567-1234567', sku: '' }),
  );
  assert.equal(chips.platformValue, 'amazon');
});
