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

  it('scan-out POST and pick session start fire identification.completed; GET claim does not', () => {
    const scanOut = src('src/app/api/shipped/scan-out/route.ts');
    assert.match(scanOut, /emitIdentificationCompleted/);
    assert.match(scanOut, /identificationFromScanOut/);
    const scanOutGet = scanOut.slice(scanOut.indexOf('export const GET'));
    assert.doesNotMatch(scanOutGet, /emitIdentificationCompleted/);

    const pickSession = src('src/app/api/picking/session/route.ts');
    assert.match(pickSession, /emitIdentificationCompleted/);
    assert.match(pickSession, /identificationFromPick/);

    const pickTasks = src('src/app/api/orders/[id]/pick-tasks/route.ts');
    assert.doesNotMatch(pickTasks, /emitIdentificationCompleted/);

    const jobGet = src('src/app/api/identification/jobs/[jobId]/route.ts');
    assert.doesNotMatch(jobGet, /emitIdentificationCompleted/);
  });

  it('scan/resolve runs routeScan print-handles before tenant classifyIdentificationScan', () => {
    const body = src('src/app/api/scan/resolve/route.ts');
    const print = body.indexOf('const handleRoute = routeScan(trimmed)');
    const tenant = body.indexOf('classifyIdentificationScan(trimmed, methods)');
    assert.ok(print >= 0, 'routeScan print-handle step missing');
    assert.ok(tenant > print, 'tenant classify must run after routeScan');
    assert.match(body, /0\.5 Tenant identification grammar/);
    assert.doesNotMatch(body, /openai|anthropic|generateText/);
    assert.doesNotMatch(body, /identification\/author/);
    assert.doesNotMatch(body, /authorIdentificationGrammar/);
  });

  it('identification author lives on methods/author, not the gun resolve path', () => {
    const author = src('src/app/api/identification/methods/author/route.ts');
    assert.match(author, /authorIdentificationGrammar/);
    const resolve = src('src/app/api/scan/resolve/route.ts');
    assert.doesNotMatch(resolve, /authorIdentificationGrammar/);
    assert.doesNotMatch(resolve, /methods\/author/);
  });
});
