import test from 'node:test';
import assert from 'node:assert/strict';
import { NavRecentRowSchema } from '@/lib/nav/context/schema';
import {
  identifiedRecentRow,
  packerLogRecentRow,
  pickupOrderRecentRows,
  receivingLineRecentRow,
  runNavRecentAdapter,
  techLogRecentRow,
  type NavRecentAdapterDeps,
} from './adapters';
import type { LocalPickupLineRow } from '@/lib/local-pickup/pickup-lines-query';

const ORG = '00000000-0000-0000-0000-000000000001';

const line = {
  id: 301,
  receiving_id: 88,
  tracking_number: '1Z999',
  zoho_purchaseorder_number: 'PO-1204',
  item_name: 'Bose 700 (zoho name)',
  catalog_product_title: 'Bose Noise Cancelling Headphones 700',
  zoho_item_title: null,
  sku: 'BOSE-700-BLK',
  workflow_status: 'MATCHED',
  last_activity_at: '2026-09-26T15:00:00Z',
  unbox_opened_at: '2026-09-26T14:00:00Z',
  scanned_at: '2026-09-26T13:00:00Z',
  testing_opened_at: null,
  created_at: '2026-09-20T00:00:00Z',
};

test('receiving rows: each surface opens its own station and sorts on its own rail clock', () => {
  const unbox = receivingLineRecentRow(line, 'receiving.unbox_opened');
  const triage = receivingLineRecentRow(line, 'receiving.scanned');
  const qc = receivingLineRecentRow({ ...line, testing_opened_at: '2026-09-26T16:30:00Z' }, 'testing.opened');
  assert.deepEqual(unbox, {
    id: 'receiving_line:301',
    entityType: 'receiving_line',
    entityId: '301',
    title: 'Bose Noise Cancelling Headphones 700',
    subtitle: 'PO-1204 · 1Z999',
    status: 'MATCHED',
    at: '2026-09-26T14:00:00.000Z',
    href: '/unbox?recvId=88&lineId=301',
  });
  assert.equal(triage?.href, '/triage?recvId=88&lineId=301');
  assert.equal(triage?.at, '2026-09-26T13:00:00.000Z');
  assert.equal(qc?.href, '/receiving/lines/301');
  assert.equal(qc?.at, '2026-09-26T16:30:00.000Z');
  for (const row of [unbox, triage, qc]) assert.ok(NavRecentRowSchema.safeParse(row).success);
});

test('a lineless carton placeholder (negative id) is the carton, not a line', () => {
  const row = receivingLineRecentRow(
    { ...line, id: -88, catalog_product_title: null, item_name: null, sku: null, zoho_purchaseorder_number: null },
    'receiving.unbox_opened',
  );
  assert.equal(row?.entityType, 'receiving');
  assert.equal(row?.entityId, '88');
  assert.equal(row?.title, 'Carton 88');
  assert.equal(row?.href, '/unbox?recvId=88');
});

test('rows without any usable timestamp are dropped instead of emitting an invalid `at`', () => {
  const none = { ...line, last_activity_at: null, unbox_opened_at: 'not a date', scanned_at: null, created_at: null };
  assert.equal(receivingLineRecentRow(none, 'receiving.unbox_opened'), null);
  assert.equal(techLogRecentRow({ id: 1, created_at: '', source_kind: 'tech_scan', fnsku: null, shipping_tracking_number: null, order_db_id: null, order_id: null, product_title: null }), null);
});

test('a bench scan links to its order, else its FNSKU, else the Picker history search on the raw scan', () => {
  const base = { id: 9, created_at: '2026-09-26T12:00:00Z', source_kind: 'tech_scan' as const, product_title: null, order_id: null };
  const order = techLogRecentRow({ ...base, fnsku: null, shipping_tracking_number: '1ZABC', order_db_id: 4411, order_id: '114-22' });
  const fnsku = techLogRecentRow({ ...base, fnsku: 'X00ABC123', shipping_tracking_number: 'X00ABC123', order_db_id: null });
  const raw = techLogRecentRow({ ...base, fnsku: null, shipping_tracking_number: '9400 1111', order_db_id: null });
  assert.deepEqual([order?.entityType, order?.entityId, order?.href], ['order', '4411', '/shipping/orders?openOrderId=4411']);
  assert.equal(order?.title, 'Order 114-22');
  assert.deepEqual([fnsku?.entityType, fnsku?.href], ['fnsku', '/shipping/fba?q=X00ABC123']);
  assert.deepEqual([raw?.entityType, raw?.href], ['tech_scan', '/pick?ship=history&search=9400+1111']);
});

test('a pack opens its retained order record when known', () => {
  const row = packerLogRecentRow({
    id: 77, packer_log_id: 501, created_at: '2026-09-26T11:00:00Z', order_row_id: 4411,
    order_id: '114-22', product_title: 'JBL Flip 6', shipping_tracking_number: '1ZXYZ', tracking_type: 'ORDERS',
  });
  assert.equal(row?.href, '/shipping/orders?openOrderId=4411');
  assert.deepEqual([row?.entityType, row?.entityId, row?.subtitle], ['packer_log', '501', '#114-22 · 1ZXYZ']);
});

test('pickup lines collapse to one row per order, newest pickup first, respecting the limit', () => {
  const mk = (id: number, order_id: number, extra: Partial<LocalPickupLineRow> = {}): LocalPickupLineRow => ({
    id, order_id, sku: null, product_title: null, image_url: null, quantity: 1, condition_grade: null, parts_status: null,
    missing_parts_note: null, condition_note: null, total_price: '0.00', po_number: `PO-${order_id}`, reference_number: null,
    customer_name: `Customer ${order_id}`, order_status: 'PROCESS', receiving_id: null, pickup_date: null,
    order_created_at: '2026-09-25 10:00:00+00', zoho_po_id: null, zoho_status: null, zoho_total: null, zoho_po_date: null,
    zoho_vendor_name: null, ...extra,
  });
  const lines = [mk(1, 30, { pickup_date: '2026-09-27' }), mk(2, 30), mk(3, 30), mk(4, 12), mk(5, 9)];
  const rows = pickupOrderRecentRows(lines, 2);
  assert.deepEqual(rows.map((r) => [r.entityId, r.subtitle, r.href]), [
    ['30', 'PO-30 · 3 items', '/pickup?lcpu=30'],
    ['12', 'PO-12 · 1 item', '/pickup?lcpu=12'],
  ]);
  assert.equal(rows[0].at, '2026-09-27T00:00:00.000Z');
});

test('identified records keep only search-hit kinds; the query that found them is the fallback title', () => {
  const hit = identifiedRecentRow({ entity_type: 'ticket', entity_id: 9600, title: null, subtitle: null, query: 'refund bose', opened_at: '2026-09-26T09:00:00Z' });
  assert.deepEqual([hit?.title, hit?.subtitle, hit?.href], ['refund bose', null, '/support?item=9600']);
  assert.equal(identifiedRecentRow({ entity_type: 'nonsense', entity_id: 1, title: 'x', subtitle: null, query: 'q', opened_at: '2026-09-26T09:00:00Z' }), null);
});

test('per-staff feeds are read for the caller; org-wide feeds are not narrowed to them', async () => {
  const calls: Record<string, unknown> = {};
  const deps = {
    fetchPackerLogRows: async (opts: unknown) => { calls.packer = opts; return { rows: [] }; },
    listRecentLabelPrints: async (_org: string, opts: unknown) => { calls.labels = opts; return []; },
    listLocalPickupLines: async (_org: string, opts: unknown) => { calls.pickup = opts; return []; },
    readIdentified: async (_org: string, staffId: number, limit: number) => { calls.identify = { staffId, limit }; return []; },
    fetchReceivingLinesPage: async (input: { query: { view: string | null; limit: number }; viewerStaffId: number }) => {
      calls.receiving = { view: input.query.view, limit: input.query.limit, viewer: input.viewerStaffId };
      return { rows: [], total: 0 };
    },
  } as unknown as NavRecentAdapterDeps;
  const args = { orgId: ORG, staffId: 5, limit: 12 };
  await runNavRecentAdapter('packer.packs', args, deps);
  await runNavRecentAdapter('labels.prints', args, deps);
  await runNavRecentAdapter('pickup.orders', args, deps);
  await runNavRecentAdapter('identify.opened', args, deps);
  await runNavRecentAdapter('receiving.viewed', args, deps);
  assert.deepEqual(calls.packer, { organizationId: ORG, packerId: 5, limit: 12 });
  assert.deepEqual(calls.labels, { limit: 12, staffId: 5 });
  assert.deepEqual(calls.pickup, { status: '', q: '', limit: 500 });
  assert.deepEqual(calls.identify, { staffId: 5, limit: 12 });
  assert.deepEqual(calls.receiving, { view: 'viewed', limit: 12, viewer: 5 });
});
