import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { inboundOrderEditRecordFrom, inboundPlatformForIdentity, type InboundOrderHeaderRow } from './inbound-order-edit';
import { listCartonInboundOrders, loadInboundOrderEdit, type LoadInboundOrderEditDeps } from './load-inbound-order-edit';
import { appendInboundLine, patchInboundLine } from './inbound-order-compose';
import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  inboundOrderIdentity,
  inboundOrderMissing,
  type InboundOrderDraft,
} from './inbound-order-draft';
import { ingestInboundOrderInTx, type IngestInboundOrderDeps } from './ingest-inbound-order';
import type { TxClient } from './purchase-links';

const ORG = '00000000-0000-0000-0000-00000000bbbb' as OrgId;
const FORM = { origin: 'manual' as const, source: 'form', staffId: 7 };

const HEADER: InboundOrderHeaderRow = {
  id: 41,
  source_type: 'manual',
  source_platform: 'goodwill',
  external_order_id: 'GW 900',
  receiving_type: 'PO',
  origin: 'csv',
  status: 'open',
  vendor_name: 'Goodwill SoCal',
  currency: 'USD',
  order_date: '2026-10-01',
  expected_date: null,
  priority_tier: 3,
  notes: null,
};

const LINES = [
  { line_key: 'L1', sku: 'A-1', item_name: 'Wrong title', sku_catalog_id: null, quantity_expected: 2, quantity_received: 1, unit_cost_cents: 500, listing_url: null },
  { line_key: 'L2', sku: null, item_name: 'Saddle', sku_catalog_id: null, quantity_expected: 1, quantity_received: 0, unit_cost_cents: null, listing_url: null },
];

/** The draft the CSV landed with — its buyer account and item numbers live only in the ledger. */
const LEDGER: InboundOrderDraft = {
  ...emptyInboundOrderDraft('PO'),
  platform: 'goodwill',
  orderNumber: 'gw900',
  vendor: 'Goodwill SoCal',
  accountName: 'shopgoodwill-main',
  priority: '3',
  lines: [
    { ...emptyInboundOrderLine(), sku: 'A-1', title: 'Wrong title', quantity: 2, unitCostCents: 500, itemNumber: 'IT-1' },
    { ...emptyInboundOrderLine(), title: 'Saddle', quantity: 1, itemNumber: 'IT-2' },
  ],
};

test('identity inverse: the rebuilt platform reproduces the stored (source_type, source_platform)', () => {
  for (const [type, platform] of [['manual', 'goodwill'], ['manual', 'none'], ['ebay', 'none'], ['amazon', 'none']] as const) {
    const token = inboundPlatformForIdentity(type, platform);
    const identity = inboundOrderIdentity({ platform: token, orderNumber: 'X1' });
    assert.deepEqual([identity.sourceType, identity.sourcePlatform], [type, platform], `${type}/${platform}`);
  }
});

test('a landed order reopens with its identity, line keys, current rows and ledger-only facts', () => {
  const record = inboundOrderEditRecordFrom({
    header: HEADER,
    lines: LINES,
    tracking: [{ tracking: '1Z999AA10123456784', carrier: 'UPS' }],
    ledgerPayload: LEDGER,
  });
  const { draft } = record;
  assert.equal(record.refusal, null);
  assert.deepEqual(inboundOrderIdentity(draft), inboundOrderIdentity({ platform: 'goodwill', orderNumber: 'GW 900' }));
  assert.equal(draft.priority, '3');
  assert.equal(draft.accountName, 'shopgoodwill-main');
  assert.deepEqual(draft.lines.map((l) => [l.lineKey, l.title, l.quantity, l.itemNumber]), [
    ['L1', 'Wrong title', 2, 'IT-1'],
    ['L2', 'Saddle', 1, 'IT-2'],
  ]);
  assert.deepEqual(draft.tracking, [{ number: '1Z999AA10123456784', carrier: 'UPS' }]);
  assert.deepEqual(record.landedLineKeys, ['L1', 'L2']);
  assert.deepEqual(record.receivedByLineKey, { L1: 1, L2: 0 });
  assert.deepEqual(inboundOrderMissing(draft), []);
});

test('a ledger payload of another order is ignored; Zoho and repair orders are refused', () => {
  const foreign = { ...LEDGER, orderNumber: 'OTHER-1', accountName: 'leak' };
  const record = inboundOrderEditRecordFrom({ header: HEADER, lines: LINES, tracking: [], ledgerPayload: foreign });
  assert.equal(record.draft.accountName, '');
  assert.deepEqual(record.draft.tracking, [{ number: '', carrier: '' }]);
  assert.match(inboundOrderEditRecordFrom({ header: { ...HEADER, source_type: 'zoho', source_platform: 'none' }, lines: [], tracking: [], ledgerPayload: null }).refusal ?? '', /Zoho/);
  assert.match(inboundOrderEditRecordFrom({ header: { ...HEADER, receiving_type: 'REPAIR' }, lines: [], tracking: [], ledgerPayload: null }).refusal ?? '', /repair/);
});

function fakeReads(rows: Record<string, unknown[]>): { deps: LoadInboundOrderEditDeps; sql: string[]; params: unknown[][] } {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const deps: LoadInboundOrderEditDeps = {
    query: (async (_org: OrgId, text: string, p: unknown[] = []) => {
      sql.push(text);
      params.push(p);
      const key = Object.keys(rows).find((k) => text.includes(k));
      return { rows: key ? rows[key] : [] };
    }) as LoadInboundOrderEditDeps['query'],
  };
  return { deps, sql, params };
}

test('loader: every read is org-scoped; a missing order is null', async () => {
  const f = fakeReads({
    'FROM inbound_order\n': [HEADER],
    'FROM receiving_line rl\n': LINES,
    'FROM receiving_carton rc': [],
    'FROM inbound_ingest_event': [{ payload: LEDGER }],
  });
  const record = await loadInboundOrderEdit(ORG, 41, f.deps);
  assert.equal(record?.inboundOrderId, 41);
  assert.equal(record?.draft.lines.length, 2);
  assert.ok(f.sql.every((s) => /organization_id = \$1/.test(s)));
  assert.ok(f.params.every((p) => p[0] === ORG));
  assert.equal(await loadInboundOrderEdit(ORG, 404, fakeReads({}).deps), null);

  const cartons = fakeReads({ 'FROM receiving_line rl\n       JOIN inbound_order': [{ id: 41, external_order_id: 'GW 900', source_type: 'manual', source_platform: 'goodwill', receiving_type: 'PO', line_count: 2 }] });
  assert.deepEqual(await listCartonInboundOrders(ORG, 12, cartons.deps), [
    { inboundOrderId: 41, orderNumber: 'GW 900', platform: 'goodwill', type: 'PO', lineCount: 2, refusal: null },
  ]);
});

/** The writer's transaction against a fake client (same seam as ingest-inbound-order.test.ts). */
function fakeWriter(priorHash?: string) {
  const sql: Array<{ text: string; params: ReadonlyArray<unknown> }> = [];
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      sql.push({ text, params });
      if (/FROM inbound_order\s+WHERE/.test(text)) return { rows: priorHash === undefined ? [] : [{ id: 41, content_hash: priorHash }], rowCount: 1 };
      if (/INSERT INTO suppliers/.test(text)) return { rows: [{ id: 3 }], rowCount: 1 };
      if (/INSERT INTO inbound_order/.test(text)) return { rows: [{ id: 41, created: priorHash === undefined }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) as TxClient['query'],
  };
  const ingested: Array<Record<string, unknown>> = [];
  const deps: IngestInboundOrderDeps = {
    registerShipment: async () => 77,
    ingestPurchase: (async (_org: OrgId, input: Record<string, unknown>) => {
      ingested.push(input);
      return { receivingLineId: 100 + ingested.length, receivingId: 12, created: priorHash === undefined, platformAccountId: null, sourceType: 'manual', sourceOrderId: String(input.sourceOrderId) };
    }) as unknown as IngestInboundOrderDeps['ingestPurchase'],
    upsertPurchaseLink: (async () => ({})) as unknown as IngestInboundOrderDeps['upsertPurchaseLink'],
    recordEquivalence: (async () => ({})) as unknown as IngestInboundOrderDeps['recordEquivalence'],
  };
  const hash = () => sql.find((s) => /INSERT INTO inbound_order/.test(s.text))?.params[13] as string | undefined;
  return { client, ingested, deps, hash };
}

test('submit: a phone-built PO lands through the one writer as a manual form order', async () => {
  let draft: InboundOrderDraft = { ...emptyInboundOrderDraft('PO'), platform: 'goodwill', orderNumber: 'GW-SYN-1', priority: '3' };
  draft = appendInboundLine(draft, { ...emptyInboundOrderLine(), title: 'Shimano derailleur', quantity: 1, unitCostCents: 899 }).draft;
  const w = fakeWriter();
  const result = await ingestInboundOrderInTx(w.client, ORG, draft, FORM, w.deps);
  assert.equal(result.created, true);
  assert.equal(result.unchanged, false);
  assert.deepEqual(result.lines.map((l) => l.lineKey), ['L1']);
  assert.equal(w.ingested[0].itemName, 'Shimano derailleur');
  assert.equal(w.ingested[0].unitCostCents, 899);
});

test('fix a wrong import: the corrected draft re-lands on the same order and line keys, marked updated', async () => {
  const record = inboundOrderEditRecordFrom({ header: HEADER, lines: LINES, tracking: [], ledgerPayload: LEDGER });
  // What landing the reopened draft as-is would hash to — the order's stored hash.
  const first = fakeWriter();
  await ingestInboundOrderInTx(first.client, ORG, record.draft, FORM, first.deps);
  const storedHash = first.hash()!;

  // Unchanged re-submit → unchanged.
  const same = fakeWriter(storedHash);
  assert.equal((await ingestInboundOrderInTx(same.client, ORG, record.draft, FORM, same.deps)).unchanged, true);

  // Corrected title + quantity + one new line → same order, landed keys reused, new key for the new line.
  let fixed = patchInboundLine(record.draft, 0, { title: 'Shimano Deore derailleur', quantity: 3 });
  fixed = appendInboundLine(fixed, { ...emptyInboundOrderLine(), title: 'Brake pads', quantity: 4 }).draft;
  const again = fakeWriter(storedHash);
  const result = await ingestInboundOrderInTx(again.client, ORG, fixed, FORM, again.deps);
  assert.equal(result.unchanged, false);
  assert.equal(result.created, false);
  assert.equal(result.inboundOrderId, 41);
  assert.deepEqual(again.ingested.map((i) => i.lineKey), ['L1', 'L2', 'L3']);
  assert.equal(again.ingested[0].itemName, 'Shimano Deore derailleur');
  assert.equal(again.ingested[0].quantityExpected, 3);
  assert.ok(again.ingested.every((i) => i.inboundOrderId === 41));
  assert.notEqual(again.hash(), storedHash, 'content hash marks the order updated');
});
