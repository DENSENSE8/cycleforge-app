/**
 * First-write-wins for order-line price — the regression suite for the
 * operator ruling of 2026-09-15: *"since the import has no price linked to it,
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSaleAmountWrite } from './canonical-order';

test('no price imported means NO CHANGE — even onto an unpriced row', () => {
  // The sheet path: 4467 orders held 6 prices because nothing imported one.
  // The ruling's literal sentence: absence is not a write of any kind.
  assert.equal(resolveSaleAmountWrite(null, null), null);
  assert.equal(resolveSaleAmountWrite(null, '19.00'), null);
});

test('a priced row is immune to a re-sync that carries a different price', () => {
  // The clobber the ruling exists to prevent. The row holds an operator's
  // correction; the source re-states its own number.
  assert.equal(resolveSaleAmountWrite('21.00', '19.00'), null);
});

test('a source price writes onto a row that has never been priced', () => {
  // The Ecwid backfill semantics, now in the live writer too: fill the blank.
  assert.equal(resolveSaleAmountWrite('19.00', null), '19.00');
  assert.equal(resolveSaleAmountWrite('19.00', ''), '19.00');
  assert.equal(resolveSaleAmountWrite('19.00', '   '), '19.00');
});

test("an explicit '0.00' is a price, not a blank — it blocks and writes", () => {
  // A genuinely free order (replacement, giveaway) is priced at zero. Treating
  // 0 as "unpriced" would let the next sync stamp a real number over a
  // deliberate free order.
  assert.equal(resolveSaleAmountWrite('27.00', '0.00'), null);
  assert.equal(resolveSaleAmountWrite('0.00', null), '0.00');
});

test('the same-source re-sync is also a no-op (value equal, guard still first)', () => {
  // Not load-bearing for correctness, but pinned so the rule is understood as
  // position-based ("already written"), not value-based ("different").
  assert.equal(resolveSaleAmountWrite('19.00', '19.00'), null);
});
