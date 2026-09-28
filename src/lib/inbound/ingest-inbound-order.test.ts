import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { ingestInboundOrderInTx, InboundOrderRefused, type IngestInboundOrderDeps } from './ingest-inbound-order';
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
