/**
 * Local DONE repair — stuck UNBOXED + qty-received promote on Inventory Refresh.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/receiving/promote-locally-received.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('promoteLocallyReceivedUnboxedToDone selects UNBOXED + qty_received > 0 only', () => {
  const mod = src('lib/receiving/promote-locally-received.ts');
  assert.match(mod, /workflow_status = 'UNBOXED'/);
  assert.match(mod, /quantity_received/);
  assert.match(mod, /to: 'DONE'/);
  assert.match(mod, /expectedFrom: 'UNBOXED'/);
});

test('inventory-sync runs local DONE repair before Zoho import', () => {
  const route = src('app/api/receiving/[id]/inventory-sync/route.ts');
  assert.match(route, /promoteLocallyReceivedUnboxedToDone/);
  // Call sites (not the import line) — repair must precede the live pull.
  const repairCall = route.indexOf('await promoteLocallyReceivedUnboxedToDone');
  const importCall = route.indexOf('await importZohoPurchaseOrderToReceiving');
  assert.ok(repairCall >= 0 && importCall >= 0, 'both await calls present');
  assert.ok(repairCall < importCall, 'local repair must run before live Zoho import');
  assert.match(route, /local_promoted/);
});

test('mark-received-po stamps DONE for Zoho-linked receives (local DONE stands)', () => {
  const route = src('app/api/receiving/mark-received-po/route.ts');
  assert.match(
    route,
    /set_workflow_status: skipZohoReceive \? 'MATCHED' : 'DONE'/,
    'real receive targets DONE, not UNBOXED',
  );
  assert.doesNotMatch(
    route,
    /zohoPendingIds/,
    'no Zoho-pending UNBOXED park batch',
  );
  assert.match(
    route,
    /marked_received: !skipZohoReceive && !isUnreceive && updatedLines\.length > 0/,
    'marked_received means local DONE, not Zoho attempt',
  );
  assert.doesNotMatch(
    route,
    /expectedFrom: 'UNBOXED'/,
    'no after() UNBOXED→DONE gate on Zoho success',
  );
});

test('mark-received twin always targets DONE', () => {
  const route = src('app/api/receiving/mark-received/route.ts');
  assert.match(route, /const targetWorkflowStatus = 'DONE'/);
  assert.doesNotMatch(route, /hasZohoReceive \? 'UNBOXED' : 'DONE'/);
});
