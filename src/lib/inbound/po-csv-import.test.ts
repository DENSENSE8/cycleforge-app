import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { OrgId } from '@/lib/tenancy/constants';
import type { tenantQuery } from '@/lib/tenancy/db';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  filledInboundLines,
  inboundOrderDraftSchema,
  inboundOrderFingerprint,
  inboundOrderMissing,
  normalizeInboundOrderNumber,
} from './inbound-order-draft';
import {
  ingestInboundOrderInTx,
  type IngestInboundOrderDeps,
  type InboundOrderPreview,
  type previewInboundOrder,
  type ingestInboundOrder,
} from './ingest-inbound-order';
import type { InboundBatchDeps } from './import-batch';
import type { TxClient } from './purchase-links';
import { runPoCsvImport, type PoCsvImportInput } from './po-csv-import';

const ORG = '00000000-0000-4000-8000-0000000000c5' as OrgId;
const fixture = parseCsv(readFileSync(new URL('./fixtures/goodwill-po-synthetic.csv', import.meta.url), 'utf8'));

/**
 * One fake database: `inbound_order` rows by normalized order # (content
 * hash as the REAL `ingestInboundOrderInTx` computed it) plus every batch
 * write. The preview reads the same store with `previewInboundOrder`'s rule.
 */
function fakeDb() {
  const orders = new Map<string, { id: number; hash: string }>();
  const batchWrites: string[] = [];
  /** Every `inbound_import_row` INSERT: its SQL, params and the decoded row records. */
  const importRowInserts: { sql: string; params: ReadonlyArray<unknown>; rows: Array<Record<string, unknown>> }[] = [];
  const client: TxClient = {
    query: (async (text: string, params: ReadonlyArray<unknown> = []) => {
      if (/SELECT id, content_hash FROM inbound_order/.test(text)) {
        const hit = orders.get(String(params[3]));
        return { rows: hit ? [{ id: hit.id, content_hash: hit.hash }] : [], rowCount: hit ? 1 : 0 };
      }
      if (/INSERT INTO suppliers/.test(text)) return { rows: [{ id: 3 }], rowCount: 1 };
      if (/INSERT INTO inbound_order\b/.test(text)) {
        const norm = normalizeInboundOrderNumber(String(params[3]));
        const prior = orders.get(norm);
        const id = prior?.id ?? orders.size + 1;
        orders.set(norm, { id, hash: String(params[13]) });
        return { rows: [{ id, created: !prior }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as TxClient['query'],
  };
  const ingestDeps: IngestInboundOrderDeps = {
    registerShipment: async () => 77,
    ingestPurchase: (async (_org: OrgId, input: Record<string, unknown>) => ({
      receivingLineId: 100, receivingId: 12, created: true, platformAccountId: null, sourceType: 'manual', sourceOrderId: String(input.sourceOrderId),
    })) as unknown as IngestInboundOrderDeps['ingestPurchase'],
    upsertPurchaseLink: (async () => ({})) as unknown as IngestInboundOrderDeps['upsertPurchaseLink'],
    recordEquivalence: (async () => ({})) as unknown as IngestInboundOrderDeps['recordEquivalence'],
  };
  const preview = (async (_org: OrgId, raw: unknown) => {
    const draft = inboundOrderDraftSchema.parse(raw);
    const hit = orders.get(normalizeInboundOrderNumber(draft.orderNumber));
    const missing = inboundOrderMissing(draft, { returnClaim: false });
    const hash = createHash('sha256').update(inboundOrderFingerprint(draft)).digest('hex');
    return {
      missing,
      identity: null,
      existing: hit ? { inboundOrderId: hit.id, status: 'open', origin: 'csv', lineCount: 1, receivedLines: 0 } : null,
      lines: filledInboundLines(draft).map((_, index) => ({ index, lineKey: `L${index + 1}`, action: 'create', catalog: null })),
      untouchedLineKeys: [],
      sameNumberElsewhere: [],
      tracking: [],
      unchanged: Boolean(hit && missing.length === 0 && hit.hash === hash),
    } satisfies InboundOrderPreview;
  }) as typeof previewInboundOrder;
  const ingest = ((org: OrgId, draft: unknown, ctx: Parameters<typeof ingestInboundOrder>[2]) =>
    ingestInboundOrderInTx(client, org, draft, ctx, ingestDeps)) as typeof ingestInboundOrder;
  const query = (async (_org: OrgId, sql: string, params: ReadonlyArray<unknown> = []) => {
    const write = /^(INSERT INTO|UPDATE)\s+(\w+)/.exec(sql.trim());
    batchWrites.push(write ? `${write[1]} ${write[2]}` : sql.trim().split(/\s+/)[0]);
    if (write?.[2] === 'inbound_import_row') {
      const rows = JSON.parse(String(params[2])) as Array<Record<string, unknown>>;
      importRowInserts.push({ sql, params, rows });
      return { rows: [], rowCount: rows.length };
    }
    return { rows: [{ id: 501 }], rowCount: 1 };
  }) as unknown as typeof tenantQuery;
  const deps: InboundBatchDeps = { query, preview, ingest, receiveIfUnboxed: async () => null };
  return { orders, batchWrites, importRowInserts, deps };
}

/** The writer stamps the tenant on every kept file row: organization_id is the first column, bound to $1 = the org. */
function assertImportRowsStamped(insert: { sql: string; params: ReadonlyArray<unknown> }) {
  assert.match(insert.sql, /INSERT INTO inbound_import_row\s*\(\s*organization_id,/);
  assert.match(insert.sql, /SELECT \$1,/);
  assert.equal(insert.params[0], ORG);
}

const goodwill = (over: Partial<PoCsvImportInput> = {}): PoCsvImportInput => ({
  fileName: 'goodwill-po-synthetic.csv',
  headers: fixture.headers,
  rows: fixture.rows,
  preset: 'goodwill',
  platform: 'goodwill',
  dryRun: true,
  staffId: 7,
  ...over,
});

test('a Goodwill CSV with unfamiliar headers groups into orders with the preset stamped', async () => {
  const db = fakeDb();
  const r = await runPoCsvImport(ORG, goodwill(), { batch: db.deps });
  assert.deepEqual(r.identification.missingRequired, []);
  assert.deepEqual(r.rowProblems, []);
  assert.equal(r.preset, 'goodwill');
  const orders = r.batch!.orders;
  assert.deepEqual(orders.map((o) => [o.orderNumber, o.rows, o.lines, o.tier, o.change]), [
    ['99990001', [0, 1], 2, '3', 'new'],
    ['99990002', [2], 1, '3', 'new'],
    ['99990003', [3], 1, '3', 'new'],
  ]);
  assert.deepEqual(r.summary, { orders: 3, new: 3, updated: 0, unchanged: 0, needsFix: 0, landed: 0, failed: 0 });
});

test('dry run writes nothing; same file twice → unchanged (dry run and commit)', async () => {
  const db = fakeDb();
  await runPoCsvImport(ORG, goodwill(), { batch: db.deps });
  assert.deepEqual(db.batchWrites, [], 'a dry run records no batch');
  assert.deepEqual(db.importRowInserts, [], 'a dry run keeps no file rows');
  assert.equal(db.orders.size, 0);

  const landed = await runPoCsvImport(ORG, goodwill({ dryRun: false }), { batch: db.deps });
  assert.equal(landed.summary.landed, 3);
  assert.equal(landed.summary.new, 3);
  assert.deepEqual(db.batchWrites, ['INSERT INTO inbound_import_batch', 'INSERT INTO inbound_import_row', 'UPDATE inbound_import_batch']);
  assert.equal(db.orders.size, 3);
  // One INSERT keeps the whole file, one record per data row, numbered from 1.
  assert.equal(db.importRowInserts.length, 1);
  const [kept] = db.importRowInserts;
  assertImportRowsStamped(kept);
  assert.deepEqual(kept.rows.map((r) => r.row_number), fixture.rows.map((_, i) => i + 1));
  assert.deepEqual(kept.rows.map((r) => r.status), fixture.rows.map(() => 'landed'));
  assert.deepEqual(kept.rows.map((r) => r.order_key), ['99990001', '99990001', '99990002', '99990003']);
  assert.deepEqual(kept.rows[0].cells, fixture.rows[0]);

  // Re-parse the same bytes, as a re-upload would.
  const again = parseCsv(readFileSync(new URL('./fixtures/goodwill-po-synthetic.csv', import.meta.url), 'utf8'));
  const preview = await runPoCsvImport(ORG, goodwill({ headers: again.headers, rows: again.rows }), { batch: db.deps });
  assert.deepEqual(preview.batch!.orders.map((o) => o.change), ['unchanged', 'unchanged', 'unchanged']);
  assert.equal(preview.summary.unchanged, 3);

  const recommit = await runPoCsvImport(ORG, goodwill({ headers: again.headers, rows: again.rows, dryRun: false }), { batch: db.deps });
  assert.deepEqual(recommit.batch!.orders.map((o) => o.status), ['unchanged', 'unchanged', 'unchanged']);

  // One edited cell → that order alone is an update.
  const edited = again.rows.map((row, i) => (i === 2 ? { ...row, Paid: '$25.00' } : row));
  const changed = await runPoCsvImport(ORG, goodwill({ headers: again.headers, rows: edited }), { batch: db.deps });
  assert.deepEqual(changed.batch!.orders.map((o) => o.change), ['unchanged', 'updated', 'unchanged']);
});

test('needs-fix rows hold their whole order with the exact field; a row without an order # is reported, not dropped', async () => {
  const headers = ['PO', 'Title', 'Qty', 'Price'];
  const rows = [
    { PO: 'A-100', Title: 'Bottom bracket tool', Qty: '1', Price: '$4.00' },
    { PO: 'A-100', Title: 'Crank puller', Qty: '', Price: '$6.00' },
    { PO: 'B-200', Title: 'Spoke wrench', Qty: '2', Price: '$3.00' },
    { PO: '', Title: 'Orphan item', Qty: '1', Price: '$1.00' },
    { PO: 'C-300', Title: '', Qty: '1', Price: 'free' },
  ];
  const db = fakeDb();
  const input = { fileName: 'tools.csv', headers, rows, preset: 'generic', platform: 'ebay', staffId: null } as const;
  const r = await runPoCsvImport(ORG, { ...input, dryRun: true }, { batch: db.deps });

  assert.deepEqual(
    r.rowProblems.map((p) => [p.row, p.field]),
    [[1, 'quantity'], [3, 'order_number'], [4, 'item_title'], [4, 'unit_cost']],
  );
  const byNumber = Object.fromEntries(r.batch!.orders.map((o) => [o.orderNumber, o]));
  assert.equal(byNumber['A-100'].status, 'invalid');
  assert.deepEqual(byNumber['A-100'].problems, ['Row 3: Quantity is blank'], 'blank quantity is flagged, never assumed 1');
  assert.equal(byNumber['B-200'].status, 'valid');
  assert.equal(byNumber['C-300'].status, 'invalid');
  assert.equal(r.summary.needsFix, 2);
  assert.ok(!r.batch!.orders.some((o) => o.rows.includes(3)), 'the orphan row belongs to no order — it is in rowProblems');

  // Commit lands only the clean order.
  const committed = await runPoCsvImport(ORG, { ...input, dryRun: false }, { batch: db.deps });
  assert.equal(committed.summary.landed, 1);
  assert.deepEqual([...db.orders.keys()], ['B-200']);
  // Every file row is kept — held rows (including the orphan) with their reason.
  assert.equal(db.importRowInserts.length, 1);
  const [kept] = db.importRowInserts;
  assertImportRowsStamped(kept);
  assert.deepEqual(kept.rows.map((r) => [r.row_number, r.status]), [[1, 'held'], [2, 'held'], [3, 'landed'], [4, 'held'], [5, 'held']]);
  assert.equal(kept.rows[3].order_key, null);
  assert.equal(kept.rows[3].problem, 'Order # is blank');
});

test('required columns still missing → no grouping; the AI runs only when asked', async () => {
  const headers = ['Thing', 'Bits'];
  const rows = [{ Thing: 'aa', Bits: 'bb' }];
  let calls = 0;
  const propose = (async (_org: OrgId, input: { deterministicMapping: Partial<Record<string, string>> }) => {
    calls += 1;
    assert.deepEqual(input.deterministicMapping, {});
    return {
      suggestions: [
        { field: 'order_number', header: 'Thing', confidence: 'high', reason: 'Looks like the order ref' },
        { field: 'item_title', header: 'Bits', confidence: 'medium', reason: 'Item words' },
      ],
      stillUnmapped: [],
      model: 'test-model',
      source: 'test',
      rejectedHallucinations: [],
    };
  }) as never;
  const db = fakeDb();

  const plain = await runPoCsvImport(ORG, { fileName: 'bits.csv', headers, rows, preset: 'goodwill', dryRun: true, staffId: null }, { batch: db.deps, propose });
  assert.equal(calls, 0);
  assert.equal(plain.batch, null);
  assert.deepEqual(plain.identification.missingRequired, ['order_number', 'item_title']);

  const assisted = await runPoCsvImport(ORG, { fileName: 'bits.csv', headers, rows, preset: 'goodwill', dryRun: true, assist: true, staffId: null }, { batch: db.deps, propose });
  assert.equal(calls, 1);
  assert.equal(assisted.identification.mapping.order_number, 'Thing');
  assert.equal(assisted.identification.columns.find((c) => c.header === 'Thing')?.reason, 'ai');
  assert.equal(assisted.batch?.orders.length, 1);
});
