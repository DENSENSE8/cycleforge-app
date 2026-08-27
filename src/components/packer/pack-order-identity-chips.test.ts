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
      scanType: 'SKU',
    }),
  );
  assert.equal(chips.poDisplay, 'ORD-12345678');
  assert.equal(chips.tracking, '1Z999AA10123456784');
  assert.notEqual(chips.poDisplay, 'SKU-999');
});

test('missing order# falls back to tracking, still never SKU', () => {
  const chips = resolvePackOrderIdentityChips(
    pane({
      orderId: '',
      sku: 'SKU-ONLY',
      tracking: '9400111899223344556677',
      scanType: 'SKU',
    }),
  );
  assert.equal(chips.poDisplay, '9400111899223344556677');
  assert.notEqual(chips.poDisplay, 'SKU-ONLY');
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
