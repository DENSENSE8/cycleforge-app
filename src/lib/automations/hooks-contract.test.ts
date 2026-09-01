/**
 * Wiring contract for listing→staff automations — proves the domain hooks
 * still call the shared helpers (no DB). Complements matcher / Zod unit tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('listing automation hooks (source contract)', () => {
  it('ingestCanonicalOrders fires order.imported / item_number_set', () => {
    const body = src('src/lib/orders/ingest-canonical-orders.ts');
    assert.match(body, /applyListingAssignment/);
    assert.match(body, /order\.imported/);
    assert.match(body, /order\.item_number_set/);
  });

  it('set-item-number fires order.item_number_set', () => {
    const body = src('src/app/api/orders/set-item-number/route.ts');
    assert.match(body, /applyListingAssignment/);
    assert.match(body, /order\.item_number_set/);
  });

  it('Review resolveImportException fires order.item_number_set', () => {
    const body = src('src/lib/inventory/order-import-exceptions.ts');
    assert.match(body, /applyListingAssignment/);
    assert.match(body, /order\.item_number_set/);
  });

  it('recordTestVerdict PASS calls passAllocateUnitToPendingOrder', () => {
    const body = src('src/lib/tech/recordTestVerdict.ts');
    assert.match(body, /passAllocateUnitToPendingOrder/);
    assert.match(body, /verdict === 'PASS'/);
  });

  it('orders/assign uses shared upsertOrderAssignment waist', () => {
    const body = src('src/app/api/orders/assign/route.ts');
    assert.match(body, /upsert-order-assignment/);
    assert.match(body, /upsertOrderAssignment/);
  });
});
