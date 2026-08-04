/**
 * The vendor-receipt chip face — composed from both status SoTs, never re-typed.
 *
 * Run: `npx tsx --test src/lib/receiving/zoho-receipt-face.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zohoReceiptFace } from './zoho-receipt-face';
import { ZOHO_RECEIVED_LIKE_STATUSES, ZOHO_TERMINAL_STATUSES } from './zoho-received-status';

test('absent status is NOT "Open" — it is honest absence', () => {
  // No mirror row means we have never synced that PO, which is a different fact
  // from the vendor reporting it open. The cell renders GridCellDash for null.
  for (const empty of [null, undefined, '', '   ']) {
    assert.equal(zohoReceiptFace(empty), null);
  }
});

test('every received-like status resolves emerald — read from the SoT, not a copy', () => {
  for (const status of ZOHO_RECEIVED_LIKE_STATUSES) {
    const face = zohoReceiptFace(status);
    assert.equal(face?.tone, 'received', status);
    assert.equal(face?.label, 'Received');
  }
});

test('the cancelled arm is DERIVED by subtracting received-like from terminal', () => {
  // So adding a status to either SoT lands here automatically instead of
  // needing a third edit — the drift those two modules were split to end.
  const cancelledLike = ZOHO_TERMINAL_STATUSES.filter(
    (s) => !(ZOHO_RECEIVED_LIKE_STATUSES as readonly string[]).includes(s),
  );
  assert.ok(cancelledLike.length > 0, 'the two lists must genuinely differ');
  for (const status of cancelledLike) {
    assert.equal(zohoReceiptFace(status)?.tone, 'cancelled', status);
  }
});

test('anything else is open, case-insensitively', () => {
  for (const status of ['issued', 'ISSUED', ' Draft ', 'partially_received']) {
    assert.equal(zohoReceiptFace(status)?.tone, 'open', status);
  }
  assert.equal(zohoReceiptFace('RECEIVED')?.tone, 'received');
  assert.equal(zohoReceiptFace(' Cancelled ')?.tone, 'cancelled');
});

test('every face carries a tip — the chip states a fact, never a policy', () => {
  for (const status of ZOHO_TERMINAL_STATUSES) {
    const face = zohoReceiptFace(status);
    assert.ok(face && face.tip.length > 0, status);
    // No "stale" threshold wording: every mirror row is stale by some amount,
    // and a tone that fires on a threshold invents a policy we do not have.
    assert.doesNotMatch(face!.tip, /stale/i, status);
  }
});
