/**
 * `isPurchaseOrderFlaggedReceived` — the rule that tells a genuine no-op apart
 * from a PO that must fall back to whole-PO markasreceived.
 *
 * Regression: PO 06-14980-30824 (2026-08-21) survived seven Receive clicks
 * because `mark-received-po` treated "no line quantity left to post" as
 * "received". Zoho's own header said otherwise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPurchaseOrderFlaggedReceived } from './zoho';

test('the real PO 06-14980-30824 header is NOT received', () => {
  // Verbatim shape from zoho_po_mirror.raw at the last successful sync.
  const header = {
    status: 'issued',
    order_status: 'issued',
    billed_status: 'billed',
    received_status: 'in_transit',
    total_ordered_quantity: 1,
    quantity_marked_as_received: 0,
    quantity_yet_to_receive: 0,
    is_po_marked_as_received: false,
    receives: [],
  };
  assert.equal(
    isPurchaseOrderFlaggedReceived(header),
    false,
    'a billed, in-transit PO with nothing pending must still be treated as un-received',
  );
});

test('received_status wins over the issued top-level status', () => {
  assert.equal(
    isPurchaseOrderFlaggedReceived({ status: 'issued', received_status: 'received' }),
    true,
  );
});

test('the explicit is_po_marked_as_received flag is honoured', () => {
  assert.equal(
    isPurchaseOrderFlaggedReceived({ received_status: 'in_transit', is_po_marked_as_received: true }),
    true,
  );
});

test('spacing and case in received_status do not change the answer', () => {
  assert.equal(isPurchaseOrderFlaggedReceived({ received_status: 'Received' }), true);
  assert.equal(isPurchaseOrderFlaggedReceived({ received_status: ' RECEIVED ' }), true);
  assert.equal(isPurchaseOrderFlaggedReceived({ received_status: 'partially_received' }), false);
});

test('a missing or empty header is never "received"', () => {
  // Fail toward "not received": the fallback is idempotent in Zoho, whereas
  // wrongly skipping it is the bug this rule exists to prevent.
  assert.equal(isPurchaseOrderFlaggedReceived(null), false);
  assert.equal(isPurchaseOrderFlaggedReceived(undefined), false);
  assert.equal(isPurchaseOrderFlaggedReceived({}), false);
  assert.equal(isPurchaseOrderFlaggedReceived({ received_status: null }), false);
});
