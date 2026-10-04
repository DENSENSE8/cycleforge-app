import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ingestInboundOrderInTx,
  InboundOrderRefused,
  REPAIR_DROP_OFF_SOURCE,
  type IngestInboundOrderDeps,
} from './ingest-inbound-order';
import { assignInboundLineKeys, emptyInboundOrderDraft, emptyInboundOrderLine, type InboundOrderDraft } from './inbound-order-draft';
import type { TxClient } from './purchase-links';

const ORG = '00000000-0000-0000-0000-00000000aaaa' as OrgId;
const CTX = { origin: 'manual' as const, source: 'form', staffId: 7 };

function draft(over: Partial<InboundOrderDraft> = {}): InboundOrderDraft {
  return {
    ...emptyInboundOrderDraft('PO'),
    platform: 'goodwill',
    orderNumber: ' po 77 ',
    vendor: 'Goodwill SoCal',
    tracking: [{ number: '1Z999AA10123456784', carrier: '' }],
    lines: [
      { ...emptyInboundOrderLine(), sku: 'A-1', quantity: 2 },
      { ...emptyInboundOrderLine(), title: 'Speaker', quantity: 1, unitCostCents: 1500 },
      { ...emptyInboundOrderLine(), sku: 'C-3', quantity: 4 },
    ],
    ...over,
  };
}

function fakes(opts: { priorHash?: string | null } = {}) {
  const sql: Array<{ text: string; params: ReadonlyArray<unknown> }> = [];
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      sql.push({ text, params });
      if (/FROM inbound_order\s+WHERE/.test(text)) {
        return { rows: opts.priorHash === undefined ? [] : [{ id: 5, content_hash: opts.priorHash }], rowCount: 1 };
      }
      if (/INSERT INTO suppliers/.test(text)) return { rows: [{ id: 3 }], rowCount: 1 };
      if (/INSERT INTO inbound_order/.test(text)) return { rows: [{ id: 5, created: true }], rowCount: 1 };
      if (/INSERT INTO local_pickup_orders/.test(text)) return { rows: [{ id: 44 }], rowCount: 1 };
      if (/INSERT INTO receiving_carton/.test(text)) return { rows: [{ id: 40 }], rowCount: 1 };
      if (/INSERT INTO receiving_line_facts/.test(text)) return { rows: [{ id: 8 }], rowCount: 1 };
      if (/FROM receiving_line\s+WHERE organization_id = \$1 AND inbound_order_id/.test(text)) {
        return { rows: [{ id: 91, line_key: 'L1', receiving_id: 12 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as TxClient['query'],
  };
  const ingested: Array<Record<string, unknown>> = [];
  const registered: string[] = [];
  const deps: IngestInboundOrderDeps = {
    registerShipment: async (tracking) => {
      registered.push(tracking);
      return 77;
    },
    ingestPurchase: (async (_org: OrgId, input: Record<string, unknown>) => {
      ingested.push(input);
      return { receivingLineId: 100 + ingested.length, receivingId: 12, created: true, platformAccountId: null, sourceType: 'manual', sourceOrderId: String(input.sourceOrderId) };
    }) as unknown as IngestInboundOrderDeps['ingestPurchase'],
  };
  return { client, sql, ingested, registered, deps };
}

test('a 3-line order with no typed line ids lands 3 distinct lines (L1..L3), one order', async () => {
  const f = fakes();
  const r = await ingestInboundOrderInTx(f.client, ORG, draft(), CTX, f.deps);

  assert.deepEqual(r.lines.map((l) => l.lineKey), ['L1', 'L2', 'L3']);
  assert.equal(f.ingested.length, 3);
  assert.deepEqual(f.ingested.map((i) => i.lineKey), ['L1', 'L2', 'L3']);
  assert.ok(f.ingested.every((i) => i.inboundOrderId === 5), 'every line hangs off the one header');
  assert.equal(f.ingested[1].unitCostCents, 1500);
  // The tracking is registered once, before the lines, and every line reuses it
  // (per-line registration on another connection deadlocks against this tx).
  assert.deepEqual(f.registered, ['1Z999AA10123456784']);
  assert.ok(f.ingested.every((i) => i.shipmentId === 77));
  // The order identity is platform-aware and normalized.
  assert.deepEqual(r.identity, {
    sourceType: 'manual', sourcePlatform: 'goodwill', paintPlatform: 'goodwill', externalOrderId: 'po 77', externalOrderIdNorm: 'PO77',
  });
  assert.ok(f.sql.some((s) => /INSERT INTO inbound_ingest_event/.test(s.text) && s.params[7] === 'landed'), 'ledger records the landing');
});

test('a re-post of identical content writes nothing and reports unchanged', async () => {
  const first = fakes();
  await ingestInboundOrderInTx(first.client, ORG, draft(), CTX, first.deps);
  const hash = first.sql.find((s) => /INSERT INTO inbound_order/.test(s.text))!.params[13] as string;

  const again = fakes({ priorHash: hash });
  const r = await ingestInboundOrderInTx(again.client, ORG, draft(), CTX, again.deps);
  assert.equal(r.unchanged, true);
  assert.equal(again.ingested.length, 0);
  assert.ok(!again.sql.some((s) => /INSERT INTO inbound_order\b/.test(s.text)));
  assert.ok(again.sql.some((s) => /INSERT INTO inbound_ingest_event/.test(s.text) && s.params[7] === 'unchanged'));
});

test('an incomplete order is refused before any write', async () => {
  const f = fakes();
  await assert.rejects(
    () => ingestInboundOrderInTx(f.client, ORG, draft({ lines: [{ ...emptyInboundOrderLine(), sku: 'A-1', quantity: null }] }), CTX, f.deps),
    (err: unknown) => err instanceof InboundOrderRefused && err.status === 400 && err.missing.some((m) => m.field === 'quantity'),
  );
  assert.equal(f.sql.length, 0);
});

test('a Zoho-sourced order is refused outside sync', async () => {
  const f = fakes();
  await assert.rejects(() => ingestInboundOrderInTx(f.client, ORG, draft({ platform: 'zoho' }), CTX, f.deps), InboundOrderRefused);
  assert.equal(f.ingested.length, 0);
});

test('line keys: typed ids win, blanks take their position, repeats are split', () => {
  const line = emptyInboundOrderLine();
  assert.deepEqual(
    assignInboundLineKeys([{ ...line, lineKey: 'X9' }, line, { ...line, lineKey: 'X9' }, line]),
    ['X9', 'L2', 'X9#2', 'L4'],
  );
});

test('a pickup lands one atomic Receiving and Sales projection with receipt facts', async () => {
  const f = fakes();
  const pickup = draft({
    type: 'PICKUP',
    platform: 'manual',
    orderNumber: 'LCPU-KEN-091426',
    orderDate: '2026-09-14',
    vendor: 'Ken',
    tracking: [{ number: '', carrier: '' }],
    pickup: { paymentMethod: 'VENMO', paidCents: 80_000 },
    lines: [{
      ...emptyInboundOrderLine(),
      title: 'Bose bass module 700',
      quantity: 2,
      unitCostCents: 13_000,
      conditionGrade: 'USED_B',
      partsStatus: 'MISSING_PARTS',
      missingPartsNote: 'No power cord',
    }],
  });

  const result = await ingestInboundOrderInTx(f.client, ORG, pickup, CTX, f.deps);

  const header = f.sql.find((entry) => /INSERT INTO local_pickup_orders/.test(entry.text));
  const item = f.sql.find((entry) => /INSERT INTO local_pickup_order_items/.test(entry.text));
  assert.ok(header);
  assert.equal(result.localPickupOrderId, 44);
  assert.equal(header.params[7], 'VENMO');
  assert.equal(header.params[8], 80_000);
  assert.ok(item);
  assert.equal(item.params[1], 'L1');
  assert.equal(item.params[3], 101, 'pickup item stores its canonical receiving-line link');
  assert.equal(item.params[7], 'USED_B');
  assert.equal(item.params[8], 'MISSING_PARTS');
  assert.equal(item.params[11], 26_000);
});

function repairDropOff(): InboundOrderDraft {
  return draft({
    type: 'REPAIR',
    platform: 'manual',
    orderNumber: 'RS-4894',
    vendor: '',
    tracking: [],
    lines: [{ ...emptyInboundOrderLine(), title: 'Bose Wave Music System', quantity: 1 }],
  });
}

test('a repair drop-off lands in hand on its own carton, carrying every repair signal', async () => {
  const f = fakes();
  const result = await ingestInboundOrderInTx(
    f.client, ORG, repairDropOff(), { ...CTX, source: REPAIR_DROP_OFF_SOURCE }, f.deps,
  );

  assert.equal(f.ingested[0].receivingType, 'REPAIR');
  assert.deepEqual(f.registered, [], 'a drop-off has no tracking to register');
  // Its own manual carton, painted as a repair, is what Receiving and Cmd-K call R-40.
  const carton = f.sql.find((s) => /INSERT INTO receiving_carton/.test(s.text));
  assert.deepEqual(carton?.params, ['manual', 'RS-4894', null, ORG]);
  assert.equal(result.receivingId, 40);
  const cartonPaint = f.sql.find((s) => /UPDATE receiving_carton\s+SET intake_type = 'repair'/.test(s.text));
  assert.deepEqual(cartonPaint?.params, [40, ORG]);
  // The line joins the carton already MATCHED (in hand — never on Incoming) with the QC tier's repair flags.
  const line = f.sql.find((s) => /UPDATE receiving_line\s+SET receiving_id/.test(s.text));
  assert.ok(line && /is_repair_service = TRUE/.test(line.text) && /intake_type = 'repair'/.test(line.text));
  assert.match(line.text, /THEN 'MATCHED'/);
  assert.deepEqual(line.params, [40, ORG, [101]]);
  const fact = f.sql.find((s) => /INSERT INTO receiving_line_facts/.test(s.text));
  assert.deepEqual(fact?.params.slice(0, 3), [ORG, 101, 'repair_service']);
  assert.deepEqual(JSON.parse(String(fact?.params[3])), { isRepairService: true, ticketRef: 'RS-4894' });
  assert.equal(result.localPickupOrderId, null, 'a repair is not a local-pickup purchase');
  assert.ok(!f.sql.some((s) => /INSERT INTO suppliers/.test(s.text)), 'the customer is not a supplier');
});

test('a REPAIR drop-off from any source but its repair ticket is refused before any write', async () => {
  const f = fakes();
  await assert.rejects(
    ingestInboundOrderInTx(f.client, ORG, repairDropOff(), CTX, f.deps),
    (err: unknown) => err instanceof InboundOrderRefused && err.status === 400,
  );
  assert.equal(f.sql.length, 0);
  assert.equal(f.ingested.length, 0);
});

test('operator re-saves (form · CSV · chat) may correct line identity; syncs may not', async () => {
  for (const origin of ['manual', 'csv', 'chat'] as const) {
    const f = fakes();
    await ingestInboundOrderInTx(f.client, ORG, draft(), { ...CTX, origin }, f.deps);
    assert.ok(f.ingested.every((i) => i.operatorResave === true), `${origin} re-save wins`);
  }
  const sync = fakes();
  await ingestInboundOrderInTx(sync.client, ORG, draft({ platform: 'ebay' }), { origin: 'sync', source: 'ebay', staffId: null }, sync.deps);
  assert.ok(sync.ingested.every((i) => i.operatorResave === false), 'a marketplace re-sync only fills blanks');
});

test('a synced order carries its marketplace status to the mirror and line facts', async () => {
  const f = fakes();
  await ingestInboundOrderInTx(
    f.client,
    ORG,
    draft({ platform: 'ebay', sourceStatus: { order: 'Completed', payment: 'Complete' } }),
    { origin: 'sync', source: 'ebay', staffId: null },
    f.deps,
  );
  assert.ok(f.ingested.every((i) => i.status === 'Completed' && i.purchaseOrderStatus === 'Completed' && i.paymentStatus === 'Complete'));
  const plain = fakes();
  await ingestInboundOrderInTx(plain.client, ORG, draft(), CTX, plain.deps);
  assert.ok(plain.ingested.every((i) => i.status === 'ISSUED' && i.paymentStatus === null), 'an authored order stays ISSUED');
});
