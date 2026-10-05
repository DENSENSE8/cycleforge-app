import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  ingestInboundOrderInTx,
  InboundOrderRefused,
  REPAIR_DROP_OFF_SOURCE,
  type IngestInboundOrderDeps,
} from './ingest-inbound-order';
import {
  assignInboundLineKeys,
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  isScientificNotationTracking,
  type InboundOrderDraft,
} from './inbound-order-draft';
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

/** A Zoho PO line already on the spine — what an eBay order may BE (`twins`). */
interface TwinRow { id: number; receiving_id: number | null; zoho_purchaseorder_id: string; zoho_purchaseorder_number: string | null; tracking: string | null }

function fakes(opts: { priorHash?: string | null; twins?: TwinRow[]; ownLines?: boolean } = {}) {
  const sql: Array<{ text: string; params: ReadonlyArray<unknown> }> = [];
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      sql.push({ text, params });
      if (/FROM inbound_order\s+WHERE/.test(text)) {
        return { rows: opts.priorHash === undefined ? [] : [{ id: 5, content_hash: opts.priorHash }], rowCount: 1 };
      }
      if (/^SELECT 1 FROM receiving_line WHERE organization_id = \$1 AND inbound_order_id/.test(text)) {
        return { rows: opts.ownLines ? [{ one: 1 }] : [], rowCount: opts.ownLines ? 1 : 0 };
      }
      if (/WITH cand AS/.test(text)) return { rows: opts.twins ?? [], rowCount: opts.twins?.length ?? 0 };
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
  const links: Array<Record<string, unknown>> = [];
  const equivalences: Array<Record<string, unknown>> = [];
  const deps: IngestInboundOrderDeps = {
    registerShipment: async (tracking) => {
      registered.push(tracking);
      return 77;
    },
    ingestPurchase: (async (_org: OrgId, input: Record<string, unknown>) => {
      ingested.push(input);
      return { receivingLineId: 100 + ingested.length, receivingId: 12, created: true, platformAccountId: null, sourceType: 'manual', sourceOrderId: String(input.sourceOrderId) };
    }) as unknown as IngestInboundOrderDeps['ingestPurchase'],
    upsertPurchaseLink: (async (_org: OrgId, input: Record<string, unknown>) => {
      links.push(input);
      return {};
    }) as unknown as IngestInboundOrderDeps['upsertPurchaseLink'],
    recordEquivalence: (async (_org: OrgId, input: Record<string, unknown>) => {
      equivalences.push(input);
      return {};
    }) as unknown as IngestInboundOrderDeps['recordEquivalence'],
  };
  return { client, sql, ingested, registered, links, equivalences, deps };
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

// ── one purchase = one spine line (2026-10-04, 15-15078-20314) ───────────────
const SYNC = { origin: 'sync' as const, source: 'ebay', staffId: null };
const ebayOrder = (over: Partial<InboundOrderDraft> = {}) =>
  draft({
    platform: 'ebay',
    orderNumber: '15-15078-20314',
    vendor: 'seller_x',
    tracking: [{ number: '9434608106245533522453', carrier: 'USPS' }],
    lines: [{ ...emptyInboundOrderLine(), lineKey: '267768290542-10084426338515', title: 'Bose Companion 2 Series III', quantity: 1 }],
    ...over,
  });
const zohoLine = (over: Partial<TwinRow> = {}): TwinRow => ({
  id: 31872, receiving_id: 52156, zoho_purchaseorder_id: '5623409000003428382', zoho_purchaseorder_number: '15-15078-20314', tracking: '9434608106245533522453', ...over,
});

test('an eBay order that IS a Zoho PO on the spine links to its line — no twin line, no carton', async () => {
  const f = fakes({ twins: [zohoLine()] });
  const r = await ingestInboundOrderInTx(f.client, ORG, ebayOrder(), SYNC, f.deps);
  assert.equal(f.ingested.length, 0, 'no receiving_line minted');
  assert.deepEqual(f.registered, [], 'no shipment / carton registered for a twin');
  assert.deepEqual(r.attachedTo, { zohoPurchaseOrderId: '5623409000003428382', reason: 'tracking' });
  assert.deepEqual(r.lines, [{ lineKey: '267768290542-10084426338515', receivingLineId: 31872, created: false }]);
  assert.equal(r.receivingId, 52156);
  assert.deepEqual(f.links, [
    { receivingLineId: 31872, sourceType: 'ebay', sourceOrderId: '15-15078-20314', sourceLineItemId: '267768290542-10084426338515', isPrimary: false },
  ]);
  assert.deepEqual(f.equivalences, [
    { sourceTypeA: 'ebay', sourceOrderIdA: '15-15078-20314', sourceTypeB: 'zoho', sourceOrderIdB: '5623409000003428382', linkReason: 'tracking' },
  ]);
  // The candidate probe asks the PO# index by the eBay order id, normalized like zoho_purchaseorder_number_norm.
  const probe = f.sql.find((s) => /WITH cand AS/.test(s.text))!;
  assert.deepEqual(probe.params.slice(1), ['151507820314', ['9434608106245533522453']]);
  assert.ok(f.sql.some((s) => /INSERT INTO inbound_ingest_event/.test(s.text) && s.params[7] === 'landed'));
});

test('the order-number arm alone attaches (a lost tracking number still finds its PO)', async () => {
  const f = fakes({ twins: [zohoLine({ tracking: null })] });
  const r = await ingestInboundOrderInTx(f.client, ORG, ebayOrder({ tracking: [] }), SYNC, f.deps);
  assert.equal(r.attachedTo?.reason, 'order_number');
  assert.equal(f.ingested.length, 0);
});

test('an eBay order lands as itself when no PO matches, the PO match is ambiguous, or it already has lines', async () => {
  // A candidate the shared rule rejects (another order's PO#, another tracking).
  const other = fakes({ twins: [zohoLine({ zoho_purchaseorder_number: '16-15107-26018', tracking: '9400111899223456784' })] });
  assert.equal((await ingestInboundOrderInTx(other.client, ORG, ebayOrder(), SYNC, other.deps)).attachedTo, undefined);
  assert.equal(other.ingested.length, 1);
  // Two different POs both match: never guess.
  const two = fakes({ twins: [zohoLine(), zohoLine({ id: 40001, zoho_purchaseorder_id: 'OTHER-PO' })] });
  assert.equal((await ingestInboundOrderInTx(two.client, ORG, ebayOrder(), SYNC, two.deps)).attachedTo, undefined);
  assert.equal(two.ingested.length, 1);
  // Lines of its own already (a twin from before this writer): the repair retires it, the writer never re-points it.
  const landed = fakes({ twins: [zohoLine()], ownLines: true });
  assert.equal((await ingestInboundOrderInTx(landed.client, ORG, ebayOrder(), SYNC, landed.deps)).attachedTo, undefined);
  assert.ok(!landed.sql.some((s) => /WITH cand AS/.test(s.text)));
  // Not eBay: never probed.
  const manual = fakes({ twins: [zohoLine()] });
  await ingestInboundOrderInTx(manual.client, ORG, draft(), CTX, manual.deps);
  assert.ok(!manual.sql.some((s) => /WITH cand AS/.test(s.text)));
});

test('a tracking number in scientific notation is refused at the boundary, before any write', async () => {
  const f = fakes();
  await assert.rejects(
    () => ingestInboundOrderInTx(f.client, ORG, ebayOrder({ tracking: [{ number: '9.434608106245533e+21', carrier: '' }] }), SYNC, f.deps),
    (err: unknown) => err instanceof InboundOrderRefused && err.status === 400 && /scientific notation/.test(err.message),
  );
  assert.equal(f.sql.length, 0);
  assert.equal(isScientificNotationTracking('9.434608106245533E+21'), true);
  assert.equal(isScientificNotationTracking('9E21'), true);
  assert.equal(isScientificNotationTracking('9434608106245533522453'), false);
  assert.equal(isScientificNotationTracking('1Z999AA10123456784'), false);
});
