/**
 * Unit tests for the bulk Zoho purchase-receive backfill. DB-free and
 * network-free via injected deps.
 *
 * Run: `npx tsx --test src/lib/zoho/receive-backfill.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_RECEIVE_ATTEMPTS,
  runZohoReceiveBackfill,
  type BackfillDeps,
} from './receive-backfill';
import type { InventoryProvider } from '@/lib/integrations/inventory/types';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

interface ClaimRow {
  id: number;
  sku: string | null;
  zoho_purchaseorder_id: string;
  zoho_line_item_id: string;
  zoho_receive_attempts: number;
}

interface QueryCall {
  sql: string;
  params: unknown[];
}

interface ProviderCall {
  purchaseOrderId: string;
  lineItems: Array<{ line_item_id: string; quantity_received: number; item_id: string }>;
}

/**
 * Two SELECTs share the module (claim + backlog) and two UPDATEs share it
 * (success + failure stamps); the fake routes on a distinguishing fragment of
 * each so a test can assert on exactly the statement it cares about.
 */
function fakes(opts: {
  claim?: ClaimRow[];
  pendingAfter?: number;
  mirrorSettled?: number;
  provider?: Partial<InventoryProvider> | null;
}) {
  const calls: QueryCall[] = [];
  const posted: ProviderCall[] = [];
  const wholePoReceived: string[] = [];

  const query = (async (_org: OrgId, sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (/FROM receiving_line rl, zoho_po_mirror/.test(sql)) {
      return { rows: [], rowCount: opts.mirrorSettled ?? 0 };
    }
    if (/WITH claimable/.test(sql)) return { rows: opts.claim ?? [], rowCount: (opts.claim ?? []).length };
    if (/COUNT\(DISTINCT rz\.zoho_purchaseorder_id\)/.test(sql)) {
      return {
        rows: [
          {
            pending: String(opts.pendingAfter ?? 0),
            purchase_orders: '0',
            blocked: '0',
            oldest_at: null,
            last_error: null,
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }) as BackfillDeps['query'];

  const provider =
    opts.provider === null
      ? null
      : ({
          provider: 'zoho',
          orgId: ORG,
          getPurchaseOrder: async (poId: string) => ({
            purchaseorder: {
              status: 'open',
              line_items: [
                { line_item_id: 'li-1', item_id: 'item-1', quantity: 1 },
                { line_item_id: 'li-2', item_id: 'item-2', quantity: 1 },
                { line_item_id: 'li-9', item_id: 'item-9', quantity: 1 },
              ],
              purchaseorder_id: poId,
            },
          }),
          sumWarehouseReceivedByPoLineItem: async () => new Map<string, number>(),
          markPurchaseOrderReceived: async (params: ProviderCall) => {
            posted.push(params);
            return { purchasereceive: { purchase_receive_id: `pr-${params.purchaseOrderId}` } };
          },
          markPurchaseOrderReceivedWhole: async (poId: string) => {
            wholePoReceived.push(poId);
            return { purchasereceive: { purchase_receive_id: `whole-${poId}` } };
          },
          findItemBySku: async () => null,
          ...opts.provider,
        } as unknown as InventoryProvider);

  const deps: BackfillDeps = {
    query,
    resolveProvider: async () => provider,
    now: () => '2026-09-23 10:00:00',
  };

  return { deps, calls, posted, wholePoReceived };
}

/** Per-line stamps only — the mirror settle is a set-based UPDATE with no id list. */
const stampSql = (calls: QueryCall[]) =>
  calls.filter((c) => /receiving_line_id = ANY/.test(c.sql));

test('lines on one PO collapse into a SINGLE purchase receive', async () => {
  const { deps, posted } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
      { id: 12, sku: 'B', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-2', zoho_receive_attempts: 0 },
    ],
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  // The whole point of the change: two lines, one POST — not two.
  assert.equal(posted.length, 1);
  assert.equal(posted[0]!.purchaseOrderId, 'po-1');
  assert.deepEqual(
    posted[0]!.lineItems.map((l) => l.line_item_id).sort(),
    ['li-1', 'li-2'],
  );
  assert.equal(report.groups, 1);
  assert.equal(report.posted, 1);
  assert.equal(report.lines, 2);
});

test('separate POs stay separate receives', async () => {
  const { deps, posted } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
      { id: 21, sku: 'B', zoho_purchaseorder_id: 'po-2', zoho_line_item_id: 'li-2', zoho_receive_attempts: 0 },
    ],
  });

  await runZohoReceiveBackfill(ORG, {}, deps);

  assert.deepEqual(posted.map((p) => p.purchaseOrderId).sort(), ['po-1', 'po-2']);
  assert.ok(posted.every((p) => p.lineItems.length === 1));
});

test('a PO already terminal in Zoho is a noop that still clears the backlog', async () => {
  const { deps, calls, posted } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    provider: {
      getPurchaseOrder: (async () => ({
        purchaseorder: { status: 'billed', line_items: [] },
      })) as unknown as InventoryProvider['getPurchaseOrder'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(posted.length, 0, 'nothing may be posted to a terminal PO');
  assert.equal(report.noop, 1);
  assert.equal(report.posted, 0);
  // The bug this pins:
  const stamps = stampSql(calls);
  assert.equal(stamps.length, 1);
  assert.match(stamps[0]!.sql, /zoho_receive_settled_at\s*=\s*now\(\)/);
  assert.match(stamps[0]!.sql, /zoho_receive_error\s*=\s*NULL/);
  assert.equal(stamps[0]!.params[2], null, 'no receive id exists to stamp');
});

test('"already received" from the provider resolves, it does not fail', async () => {
  const { deps, calls } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    provider: {
      markPurchaseOrderReceived: (async () => {
        throw new Error('You have already created a receive for all the items in this order.');
      }) as unknown as InventoryProvider['markPurchaseOrderReceived'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(report.noop, 1);
  assert.equal(report.failed, 0);
  assert.match(stampSql(calls)[0]!.sql, /zoho_receive_settled_at\s*=\s*now\(\)/);
  assert.match(stampSql(calls)[0]!.sql, /zoho_receive_error\s*=\s*NULL/);
});

test('a real failure stamps the error and leaves the line in the backlog', async () => {
  const { deps, calls } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 2 },
    ],
    pendingAfter: 1,
    provider: {
      markPurchaseOrderReceived: (async () => {
        throw new Error('Zoho is unavailable');
      }) as unknown as InventoryProvider['markPurchaseOrderReceived'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(report.failed, 1);
  assert.equal(report.lines, 0, 'a failed group stamps no purchase-receive id');
  assert.deepEqual(report.errors, [{ zohoPurchaseOrderId: 'po-1', error: 'Zoho is unavailable' }]);
  assert.equal(report.pendingAfter, 1);

  const stamp = stampSql(calls)[0]!;
  assert.match(stamp.sql, /zoho_receive_attempts\s*=\s*zoho_receive_attempts \+ 1/);
  assert.doesNotMatch(stamp.sql, /zoho_purchase_receive_id/);
  assert.equal(stamp.params[2], 'Zoho is unavailable');
});

test('one poison PO does not stop the groups behind it', async () => {
  const { deps, posted } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-bad', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
      { id: 21, sku: 'B', zoho_purchaseorder_id: 'po-ok', zoho_line_item_id: 'li-2', zoho_receive_attempts: 0 },
    ],
    provider: {
      markPurchaseOrderReceived: (async (params: ProviderCall) => {
        if (params.purchaseOrderId === 'po-bad') throw new Error('boom');
        posted.push(params);
        return { purchasereceive: { purchase_receive_id: 'pr-ok' } };
      }) as unknown as InventoryProvider['markPurchaseOrderReceived'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(report.failed, 1);
  assert.equal(report.posted, 1);
  assert.deepEqual(posted.map((p) => p.purchaseOrderId), ['po-ok']);
});

test('a PO line with no catalog item_id fails loudly instead of posting a bad receive', async () => {
  const { deps, posted, calls } = fakes({
    claim: [
      { id: 11, sku: null, zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    provider: {
      getPurchaseOrder: (async () => ({
        purchaseorder: { status: 'open', line_items: [{ line_item_id: 'li-1', quantity: 1 }] },
      })) as unknown as InventoryProvider['getPurchaseOrder'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(posted.length, 0);
  assert.equal(report.failed, 1);
  assert.match(report.errors[0]!.error, /catalog item_id/);
  assert.match(String(stampSql(calls)[0]!.params[2]), /catalog item_id/);
});

test('a billed PO with nothing pending per line falls back to whole-PO markasreceived', async () => {
  const { deps, wholePoReceived, posted } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    provider: {
      sumWarehouseReceivedByPoLineItem: (async () =>
        new Map([['li-1', 1]])) as unknown as InventoryProvider['sumWarehouseReceivedByPoLineItem'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.deepEqual(wholePoReceived, ['po-1']);
  assert.equal(posted.length, 0);
  assert.equal(report.posted, 1);
});

test('no inventory connection burns no attempts', async () => {
  const { deps, calls } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    pendingAfter: 1,
    provider: null,
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  assert.equal(report.groups, 0);
  assert.equal(report.failed, 0);
  assert.equal(report.pendingAfter, 1);
  assert.equal(
    stampSql(calls).length,
    0,
    'a disconnected integration must not push healthy lines toward the give-up ceiling',
  );
});

test('the claim is org-scoped and bounded by the attempt ceiling', async () => {
  const { deps, calls } = fakes({ claim: [] });

  await runZohoReceiveBackfill(ORG, { maxGroups: 5 }, deps);

  const claim = calls.find((c) => /WITH claimable/.test(c.sql))!;
  assert.equal(claim.params[0], ORG);
  assert.equal(claim.params[1], MAX_RECEIVE_ATTEMPTS);
  assert.equal(claim.params[3], 5);
  assert.match(claim.sql, /rl\.organization_id = \$1/);
  assert.match(claim.sql, /rl\.workflow_status = 'DONE'/);
  assert.match(claim.sql, /rz\.zoho_purchase_receive_id IS NULL/);
});

test('POs the mirror already calls terminal settle with ZERO provider calls', async () => {
  const { deps, calls, posted } = fakes({ claim: [], mirrorSettled: 1561 });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  // The live backlog was 1830 lines / 1566 POs, of which 1561 POs were already `received` in zoho_po_mirror.
  assert.equal(report.settledFromMirror, 1561);
  assert.equal(posted.length, 0);
  assert.equal(report.groups, 0);

  const settle = calls.find((c) => /FROM receiving_line rl, zoho_po_mirror/.test(c.sql))!;
  assert.match(settle.sql, /zoho_receive_settled_at\s*=\s*now\(\)/);
  assert.match(settle.sql, /m\.status IN \('received', 'billed', 'closed'\)/);
  assert.match(settle.sql, /rz\.zoho_purchase_receive_id IS NULL/);
  assert.equal(settle.params[0], ORG, 'the settle must be org-scoped');
});

test('the mirror settle runs BEFORE any provider round-trip', async () => {
  const { deps, calls } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
    ],
    mirrorSettled: 3,
  });

  await runZohoReceiveBackfill(ORG, {}, deps);

  // Order matters: settling first shrinks the claim, so the live path only
  // ever sees POs the mirror could not already answer for.
  const settleAt = calls.findIndex((c) => /FROM receiving_line rl, zoho_po_mirror/.test(c.sql));
  const claimAt = calls.findIndex((c) => /WITH claimable/.test(c.sql));
  assert.ok(settleAt >= 0 && claimAt >= 0);
  assert.ok(settleAt < claimAt, 'mirror settle must precede the claim');
});

test('a dead credential stamps NOTHING and stops the run', async () => {
  const { deps, calls } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
      { id: 21, sku: 'B', zoho_purchaseorder_id: 'po-2', zoho_line_item_id: 'li-2', zoho_receive_attempts: 0 },
      { id: 31, sku: 'C', zoho_purchaseorder_id: 'po-3', zoho_line_item_id: 'li-3', zoho_receive_attempts: 0 },
    ],
    pendingAfter: 3,
    provider: {
      getPurchaseOrder: (async () => {
        throw new Error(
          'No active Zoho connection for org 0000. Connect via Settings → Integrations (/api/zoho/oauth/authorize).',
        );
      }) as unknown as InventoryProvider['getPurchaseOrder'],
    },
  });

  const report = await runZohoReceiveBackfill(ORG, {}, deps);

  // getInventoryProvider hands back an adapter WITHOUT reading credentials, so a revoked connection surfaces past the null-provider guard.
  assert.equal(report.notConnected, true);
  assert.equal(report.failed, 0, 'a dead credential is not a failed PO');
  assert.equal(stampSql(calls).length, 0, 'no line may be stamped');
  assert.deepEqual(report.errors, []);
});

test('a dead credential stops after the first group, not after all of them', async () => {
  let poFetches = 0;
  const { deps } = fakes({
    claim: [
      { id: 11, sku: 'A', zoho_purchaseorder_id: 'po-1', zoho_line_item_id: 'li-1', zoho_receive_attempts: 0 },
      { id: 21, sku: 'B', zoho_purchaseorder_id: 'po-2', zoho_line_item_id: 'li-2', zoho_receive_attempts: 0 },
      { id: 31, sku: 'C', zoho_purchaseorder_id: 'po-3', zoho_line_item_id: 'li-3', zoho_receive_attempts: 0 },
    ],
    provider: {
      getPurchaseOrder: (async () => {
        poFetches += 1;
        throw new Error('No active Zoho connection for org 0000.');
      }) as unknown as InventoryProvider['getPurchaseOrder'],
    },
  });

  await runZohoReceiveBackfill(ORG, {}, deps);

  // Every group shares the credential — proving it 3 times costs 3 round-trips
  // against a limiter that only has 80 per minute.
  assert.equal(poFetches, 1);
});
