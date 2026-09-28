/** DB-free unit tests for the vendor-PO replenishment domain module (src/lib/replenishment.ts) — house Deps/fakes pattern (see… */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';

import {
  transitionReplenishmentStatus,
  recalculateNeed,
  createDraftPurchaseOrders,
  type CreateDraftPurchaseOrdersDeps,
  type ReplenishmentRequestRow,
  type DbClient,
} from './replenishment';
import {
  REPLENISHMENT_ALLOWED_TRANSITIONS,
  type ReplenishmentRequestStatus,
} from './replenishment-request-status';
import type { OrgId } from './tenancy/constants';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;
const OTHER_ORG = '22222222-2222-2222-2222-222222222222' as OrgId;
const REQ_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface Captured {
  sql: string;
  params: unknown[];
}

/**
 * Fake pg client: records every query and answers via a substring-matched
 * responder table (first match wins).
 */
function fakeClient(
  responders: Array<{ match: string; rows?: Record<string, unknown>[]; rowCount?: number }> = [],
) {
  const calls: Captured[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const hit = responders.find((r) => sql.includes(r.match));
      const rows = hit?.rows ?? [];
      return { rows, rowCount: hit?.rowCount ?? rows.length };
    },
  };
  return { calls, client: client as unknown as DbClient };
}

function requestRow(over: Partial<ReplenishmentRequestRow> = {}): ReplenishmentRequestRow {
  return {
    id: REQ_ID,
    item_id: '7',
    zoho_item_id: 'z-100',
    sku_catalog_id: 42,
    supplier_id: null,
    inbound_order_id: null,
    sku: 'SKU-1',
    item_name: 'Widget',
    quantity_needed: '5',
    zoho_quantity_available: '0',
    zoho_quantity_on_hand: '0',
    zoho_incoming_quantity: '0',
    stock_available: '0',
    stock_on_hand: '0',
    stock_incoming: '0',
    quantity_to_order: '5',
    vendor_zoho_contact_id: 'vendor-1',
    vendor_name: 'Acme Supply',
    unit_cost: '10',
    status: 'pending_review',
    status_changed_at: '2026-07-09T00:00:00Z',
    zoho_po_id: null,
    zoho_po_number: null,
    notes: null,
    created_at: '2026-07-09T00:00:00Z',
    updated_at: '2026-07-09T00:00:00Z',
    ...over,
  };
}

/** One CycleForge inventory-position row (readInventoryPositions) for catalog item 42 — serialized. */
function positionRow(over: { pickable?: unknown; onHand?: unknown; incoming?: unknown } = {}) {
  return {
    id: 42,
    sku: 'SKU-1',
    serial_units: 5,
    on_hand_units: over.onHand ?? 0,
    pickable_units: over.pickable ?? 0,
    allocated_units: 0,
    bin_qty: 0,
    incoming: over.incoming ?? 0,
  };
}

const POSITION = 'FROM sku_catalog sc';

// ── transitionReplenishmentStatus ────────────────────────────────────────────

test('transition: legal move updates status and writes the status log with the org threaded', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT id, status FROM replenishment_requests', rows: [{ id: REQ_ID, status: 'detected' }] },
  ]);

  await transitionReplenishmentStatus(REQ_ID, 'pending_review', 'tester', 'note', client, ORG);

  assert.equal(calls.length, 3);
  // Row lookup is org-gated.
  assert.ok(calls[0].sql.includes('organization_id = $2'));
  assert.deepEqual(calls[0].params, [REQ_ID, ORG]);
  // UPDATE carries the org predicate.
  assert.ok(calls[1].sql.includes('UPDATE replenishment_requests'));
  assert.deepEqual(calls[1].params, [REQ_ID, 'pending_review', ORG]);
  // Status-log insert derives org from the parent and threads it as a guard.
  assert.ok(calls[2].sql.includes('INSERT INTO replenishment_status_log'));
  assert.deepEqual(calls[2].params, [REQ_ID, 'detected', 'pending_review', 'tester', 'note', ORG]);
});

test('transition: illegal move throws and writes nothing', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT id, status FROM replenishment_requests', rows: [{ id: REQ_ID, status: 'detected' }] },
  ]);

  await assert.rejects(
    () => transitionReplenishmentStatus(REQ_ID, 'fulfilled', 'tester', null, client, ORG),
    /Invalid replenishment transition: detected -> fulfilled/,
  );
  assert.equal(calls.length, 1, 'only the lookup ran; no UPDATE, no log');
});

test('transition: same status is a silent no-op (no UPDATE, no log)', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT id, status FROM replenishment_requests', rows: [{ id: REQ_ID, status: 'po_created' }] },
  ]);

  await transitionReplenishmentStatus(REQ_ID, 'po_created', 'tester', null, client, ORG);
  assert.equal(calls.length, 1);
});

test('transition: missing (or other-org) row throws not-found', async () => {
  const { client } = fakeClient([
    { match: 'SELECT id, status FROM replenishment_requests', rows: [] },
  ]);

  await assert.rejects(
    () => transitionReplenishmentStatus(REQ_ID, 'pending_review', 'tester', null, client, ORG),
    /Replenishment request not found/,
  );
});

test('transition legality matrix: terminal states allow nothing', () => {
  assert.deepEqual(REPLENISHMENT_ALLOWED_TRANSITIONS.fulfilled, []);
  assert.deepEqual(REPLENISHMENT_ALLOWED_TRANSITIONS.cancelled, []);
  // Every declared target is itself a known status.
  const known = Object.keys(REPLENISHMENT_ALLOWED_TRANSITIONS) as ReplenishmentRequestStatus[];
  for (const targets of Object.values(REPLENISHMENT_ALLOWED_TRANSITIONS)) {
    for (const target of targets) assert.ok(known.includes(target), `unknown target ${target}`);
  }
});

// ── recalculateNeed ──────────────────────────────────────────────────────────

test('recalculateNeed: missing request row → no further work', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT * FROM replenishment_requests', rows: [] },
  ]);

  await recalculateNeed(REQ_ID, client, ORG);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [REQ_ID, ORG]);
});

test('recalculateNeed: shortfall > 0 → snapshots CycleForge stock (org-gated, catalog-keyed), never cancels', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT * FROM replenishment_requests', rows: [requestRow({ status: 'detected', quantity_needed: '10' })] },
    { match: POSITION, rows: [positionRow({ pickable: 2, onHand: 4, incoming: 3 })] },
  ]);

  await recalculateNeed(REQ_ID, client, ORG);

  const update = calls.find((c) => c.sql.includes('SET stock_available'));
  assert.ok(update, 'quantity snapshot UPDATE ran');
  assert.deepEqual(update!.params, [REQ_ID, 2, 4, 3, ORG, 42]);
  assert.ok(!calls.some((c) => /item_stock_cache|FROM items/.test(c.sql)), 'no Zoho stock is consulted');
  assert.ok(!calls.some((c) => c.sql.includes('status_changed_at')), 'no cancel transition fired');
});

test('recalculateNeed: incoming stock covers demand on a detected request → auto-cancel transition', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT * FROM replenishment_requests', rows: [requestRow({ status: 'detected', quantity_needed: '5' })] },
    { match: POSITION, rows: [positionRow({ pickable: 4, incoming: 1 })] },
    { match: 'SELECT id, status FROM replenishment_requests', rows: [{ id: REQ_ID, status: 'detected' }] },
  ]);

  await recalculateNeed(REQ_ID, client, ORG);

  const cancel = calls.find((c) => c.sql.includes('status_changed_at'));
  assert.ok(cancel, 'cancel transition ran');
  assert.deepEqual(cancel!.params, [REQ_ID, 'cancelled', ORG]);
  const log = calls.find((c) => c.sql.includes('replenishment_status_log'));
  assert.ok(log);
  assert.equal(log!.params[4], 'Incoming stock already covers demand');
});

test('recalculateNeed: zero and negative quantity_needed clamp to zero shortfall → cancel on pending_review', async () => {
  for (const qty of ['0', '-7']) {
    const { calls, client } = fakeClient([
      { match: 'SELECT * FROM replenishment_requests', rows: [requestRow({ status: 'pending_review', quantity_needed: qty })] },
      { match: POSITION, rows: [positionRow()] },
      { match: 'SELECT id, status FROM replenishment_requests', rows: [{ id: REQ_ID, status: 'pending_review' }] },
    ]);

    await recalculateNeed(REQ_ID, client, ORG);
    assert.ok(
      calls.some((c) => c.sql.includes('status_changed_at') && c.params[1] === 'cancelled'),
      `qty=${qty} should auto-cancel`,
    );
  }
});

test('recalculateNeed: zero shortfall on a po_created request does NOT cancel (status gate)', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT * FROM replenishment_requests', rows: [requestRow({ status: 'po_created', quantity_needed: '0' })] },
    { match: POSITION, rows: [positionRow()] },
  ]);

  await recalculateNeed(REQ_ID, client, ORG);
  assert.ok(!calls.some((c) => c.sql.includes('status_changed_at')));
});

test('recalculateNeed: non-numeric quantities degrade to 0, never NaN in params', async () => {
  const { calls, client } = fakeClient([
    { match: 'SELECT * FROM replenishment_requests', rows: [requestRow({ status: 'waiting_for_receipt', quantity_needed: 'garbage' })] },
    { match: POSITION, rows: [positionRow()] },
  ]);

  await recalculateNeed(REQ_ID, client, ORG);
  const update = calls.find((c) => c.sql.includes('SET stock_available'));
  assert.deepEqual(update!.params, [REQ_ID, 0, 0, 0, ORG, 42]);
});

// ── createDraftPurchaseOrders ────────────────────────────────────────────────

function fakePoDeps(over: Partial<CreateDraftPurchaseOrdersDeps> & {
  rows?: ReplenishmentRequestRow[];
} = {}) {
  const seen = {
    loadOrg: null as OrgId | null,
    loadIds: null as string[] | null,
    zohoOrgs: [] as OrgId[],
    zohoPayloads: [] as Array<{ vendor_id: string; line_items: Array<{ item_id: string; quantity: number; rate: number }> }>,
    txOrgs: [] as OrgId[],
    txClient: fakeClient(),
    orders: [] as Array<{ orgId: OrgId; draft: Record<string, unknown>; origin: string; sameClient: boolean }>,
    transitions: [] as Array<{ id: string; next: ReplenishmentRequestStatus; orgId: OrgId; sameClient: boolean }>,
  };

  const deps: CreateDraftPurchaseOrdersDeps = {
    loadRequests: async (ids, orgId) => {
      seen.loadIds = ids;
      seen.loadOrg = orgId;
      return over.rows ?? [];
    },
    createZohoPurchaseOrder: async (orgId, payload) => {
      seen.zohoOrgs.push(orgId);
      seen.zohoPayloads.push(payload);
      return { purchaseorder: { purchaseorder_id: 'po-1', purchaseorder_number: 'PO-0001' } };
    },
    withTenantTransaction: async (orgId, fn) => {
      seen.txOrgs.push(orgId);
      return fn(seen.txClient.client as unknown as PoolClient);
    },
    transitionStatus: async (id, next, _changedBy, _note, client, orgId) => {
      seen.transitions.push({ id, next, orgId, sameClient: client === seen.txClient.client });
    },
    ingestOrder: (async (client: unknown, orgId: OrgId, draft: Record<string, unknown>, ctx: { origin: string }) => {
      seen.orders.push({ orgId, draft, origin: ctx.origin, sameClient: client === seen.txClient.client });
      return { inboundOrderId: 900, created: true, unchanged: false, lines: [], receivingId: null, identity: {} };
    }) as unknown as CreateDraftPurchaseOrdersDeps['ingestOrder'],
    ...over,
  };
  return { deps, seen };
}

test('createDraftPurchaseOrders: one vendor → ONE internal inbound order with every line; Zoho untouched by default', async () => {
  const rows = [
    requestRow({ id: 'r1aaaaaa-0000', quantity_to_order: '3' }),
    requestRow({ id: 'r2bbbbbb-0000', sku_catalog_id: 43, sku: 'SKU-2', quantity_to_order: '2' }),
  ];
  const { deps, seen } = fakePoDeps({ rows });

  const created = await createDraftPurchaseOrders(['r1', 'r2'], ORG, deps);

  assert.equal(seen.loadOrg, ORG);
  assert.equal(seen.zohoPayloads.length, 0, 'no external system is called');
  assert.equal(seen.orders.length, 1);
  assert.equal(seen.orders[0].origin, 'auto_replenish');
  assert.ok(seen.orders[0].sameClient, 'the order lands on the same transaction as the request updates');
  const lines = seen.orders[0].draft.lines as Array<{ skuCatalogId: number; quantity: number; unitCostCents: number }>;
  assert.deepEqual(lines.map((l) => [l.skuCatalogId, l.quantity, l.unitCostCents]), [[42, 3, 1000], [43, 2, 1000]]);
  assert.deepEqual(
    seen.transitions.map((t) => ({ id: t.id, next: t.next, orgId: t.orgId, sameClient: t.sameClient })),
    [
      { id: 'r1aaaaaa-0000', next: 'po_created', orgId: ORG, sameClient: true },
      { id: 'r2bbbbbb-0000', next: 'po_created', orgId: ORG, sameClient: true },
    ],
  );
  const stamp = seen.txClient.calls.find((c) => c.sql.includes('SET inbound_order_id'));
  assert.deepEqual(stamp!.params, ['r1aaaaaa-0000', 900, null, null, ORG]);
  assert.equal(created.length, 1);
  assert.equal(created[0].inbound_order_id, 900);
  assert.match(created[0].order_number, /^RP-\d{8}-R1AAAAAA$/);
  assert.equal(created[0].zoho_po_id, null);
});

test('createDraftPurchaseOrders: zero/negative/garbage quantities are not ordered; nothing to order makes no PO', async () => {
  const rows = [
    requestRow({ id: 'r1', quantity_to_order: '0' }),
    requestRow({ id: 'r2', quantity_to_order: '-4' }),
    requestRow({ id: 'r3', quantity_to_order: 'NaNish' }),
  ];
  const { deps, seen } = fakePoDeps({ rows });

  assert.deepEqual(await createDraftPurchaseOrders(['r1', 'r2', 'r3'], ORG, deps), []);
  assert.equal(seen.orders.length, 0);
  assert.equal(seen.txOrgs.length, 0, 'no transaction opened');
});

test('createDraftPurchaseOrders: a request with no Zoho vendor still becomes an internal purchase order', async () => {
  const rows = [requestRow({ id: 'r1', vendor_zoho_contact_id: null, zoho_item_id: null, quantity_to_order: '5' })];
  const { deps, seen } = fakePoDeps({ rows });

  const created = await createDraftPurchaseOrders(['r1'], ORG, deps, { exportToZoho: true });
  assert.equal(created.length, 1);
  assert.equal(seen.zohoPayloads.length, 0, 'nothing to export without a Zoho vendor + item');
});

test('createDraftPurchaseOrders: exportToZoho posts a copy and a Zoho failure lands nothing', async () => {
  const rows = [requestRow({ id: 'r1', quantity_to_order: '2' })];
  const ok = fakePoDeps({ rows });
  const created = await createDraftPurchaseOrders(['r1'], ORG, ok.deps, { exportToZoho: true });
  assert.deepEqual(ok.seen.zohoPayloads[0].line_items, [{ item_id: 'z-100', quantity: 2, rate: 10 }]);
  assert.equal(created[0].zoho_po_number, 'PO-0001');

  const bad = fakePoDeps({ rows, createZohoPurchaseOrder: async () => ({ purchaseorder: {} }) });
  await assert.rejects(
    () => createDraftPurchaseOrders(['r1'], ORG, bad.deps, { exportToZoho: true }),
    /Zoho PO create returned no purchaseorder id\/number/,
  );
  assert.equal(bad.seen.txOrgs.length, 0, 'no transaction opened after the Zoho failure');
});

test('createDraftPurchaseOrders: a different orgId is what reaches every collaborator (no ambient org)', async () => {
  const rows = [requestRow({ id: 'r1', quantity_to_order: '1' })];
  const { deps, seen } = fakePoDeps({ rows });

  await createDraftPurchaseOrders(['r1'], OTHER_ORG, deps);
  assert.equal(seen.loadOrg, OTHER_ORG);
  assert.deepEqual(seen.txOrgs, [OTHER_ORG]);
  assert.equal(seen.orders[0].orgId, OTHER_ORG);
  assert.equal(seen.transitions[0].orgId, OTHER_ORG);
});
