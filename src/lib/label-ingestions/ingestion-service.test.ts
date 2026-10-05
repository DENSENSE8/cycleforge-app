import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabelIngestion, deleteUnlinkedLabelIngestion, LabelIngestionServiceError, markShipStationIngestionApplied, recordShipStationLabelIngestion, shipStationClientEventId, type ShipStationLabelIngestionInput } from './ingestion-service';

const org = '00000000-0000-4000-8000-000000000001' as never;
const row = (state: string, extra: Record<string, unknown> = {}) => ({ id: 7, client_event_id: '00000000-0000-4000-8000-000000000007', state, row_version: 1, sha256: 'a'.repeat(64), file_basename: 'label.pdf', byte_size: 10, parser_version: 'v1', match_method: null, tracking_number_raw: null, tracking_number_normalized: null, carrier: null, quarantine_reason_code: null, created_at: new Date('2026-09-18T00:00:00Z'), updated_at: new Date('2026-09-18T00:00:00Z'), staged_object_key: null, source: 'MANUAL_UPLOAD', observed_at: new Date('2026-09-18T00:00:00Z'), matched_account_source: null, matched_marketplace_order_id: null, matched_order_id: null, applied_at: null, ...extra });
test('ingestion stages before parsing and persists the resolver result', async () => {
  const calls: string[] = []; const result = await createLabelIngestion({ organizationId: org, actorStaffId: 2, clientEventId: '00000000-0000-4000-8000-000000000007', observedAt: '2026-09-18T00:00:00.000Z', fileBasename: 'label.pdf', bytes: Buffer.from('%PDF-x') }, {
    query: async () => ({ rows: [] }), transaction: async (_org, fn) => fn({ query: async (sql: string) => { calls.push(sql); return { rows: [row(sql.includes("state='MATCHED'") ? 'MATCHED' : 'RECEIVED')] }; } }), store: { put: async () => { calls.push('store'); }, get: async () => Buffer.from('%PDF-x') }, parse: async () => ({ parserVersion: 'v1', cycleforgeReference: null, marketplaceOrderId: 'ORDER-1', accountSource: 'ebay', trackingNumberRaw: '1Z999AA10123456784', trackingNumberNormalized: '1Z999AA10123456784', carrier: 'UPS', multiPackageEvidence: false }), resolve: async () => ({ exactOrder: { accountSource: 'ebay', marketplaceOrderId: 'ORDER-1', matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null }, orderIds: [12], quarantineReason: null }),
    attachTracking: async () => { calls.push('attach'); },
  });
  assert.equal(result.ingestion.state, 'MATCHED'); assert.equal(calls.indexOf('store') < calls.findIndex((call) => call.includes("state='MATCHED'")), true);
});
test('bulk parses printable evidence but never resolves an order', async () => {
  let resolved = false;
  const tracking = '9400100000000000000004';
  const result = await createLabelIngestion({
    organizationId: org,
    actorStaffId: 2,
    clientEventId: '00000000-0000-4000-8000-000000000009',
    observedAt: '2026-10-04T00:00:00.000Z',
    fileBasename: 'bulk-label.pdf',
    bytes: Buffer.from('%PDF-bulk'),
    matchOrder: false,
  }, {
    query: async () => ({ rows: [] }),
    transaction: async (_org, fn) => fn({ query: async (sql: string) => ({
      rows: [sql.includes("state='QUARANTINED'")
        ? row('QUARANTINED', {
            parser_version: 'v2',
            tracking_number_raw: tracking,
            tracking_number_normalized: tracking,
            staged_object_key: 'label-ingestions/o/bulk.pdf',
            quarantine_reason_code: 'ORDER_NOT_FOUND',
          })
        : row('RECEIVED')],
    }) } as never),
    store: { put: async () => {}, get: async () => Buffer.from('%PDF-bulk') },
    parse: async () => ({
      parserVersion: 'v2',
      cycleforgeReference: null,
      marketplaceOrderId: 'CF-TEST-PH-000002',
      accountSource: 'Phone',
      trackingNumberRaw: tracking,
      trackingNumberNormalized: tracking,
      carrier: 'USPS',
      multiPackageEvidence: false,
    }),
    resolve: async () => {
      resolved = true;
      throw new Error('bulk must not resolve an order');
    },
  });
  assert.equal(result.ingestion.state, 'QUARANTINED');
  assert.equal(result.ingestion.trackingNumberNormalized, tracking);
  assert.equal(result.ingestion.matchedOrderId, null);
  assert.equal(resolved, false);
});
test('a paired label hands its tracking to every row of its order; a failed attach leaves the pairing standing', async () => {
  const attached: unknown[] = [];
  const deps = (attach: (input: unknown) => Promise<void>) => ({
    query: async () => ({ rows: [] }),
    transaction: async (_org: unknown, fn: (client: never) => unknown) => fn({ query: async (sql: string) => ({ rows: [row(sql.includes("state='MATCHED'") ? 'MATCHED' : 'RECEIVED', { match_method: sql.includes("state='MATCHED'") ? 'BUYER_NAME' : null })] }) } as never),
    store: { put: async () => {}, get: async () => Buffer.from('%PDF-x') },
    parse: async () => ({ parserVersion: 'v2', cycleforgeReference: null, marketplaceOrderId: null, accountSource: null, trackingNumberRaw: '9400 1502 0621 7932 8307 94', trackingNumberNormalized: '9400150206217932830794', carrier: 'USPS', multiPackageEvidence: false, shipToName: 'KATHARINE K. DORAN' }),
    resolve: async () => ({ exactOrder: { accountSource: 'eBay', marketplaceOrderId: '02-1', matchMethod: 'BUYER_NAME' as const, cycleforgeReference: null }, orderIds: [7, 8], quarantineReason: null }),
    attachTracking: attach,
  }) as never;
  const input = { organizationId: org, actorStaffId: 2, clientEventId: '00000000-0000-4000-8000-000000000008', observedAt: '2026-10-03T00:00:00.000Z', fileBasename: 'label.pdf', bytes: Buffer.from('%PDF-y') };
  await createLabelIngestion(input, deps(async (value) => { attached.push(value); }));
  assert.deepEqual(attached, [{ organizationId: org, orderIds: [7, 8], trackingNumber: '9400 1502 0621 7932 8307 94', carrier: 'USPS' }]);
  const stillPaired = await createLabelIngestion({ ...input, bytes: Buffer.from('%PDF-z') }, deps(async () => { throw new Error('tracking owned by another order'); }));
  assert.equal(stillPaired.ingestion.state, 'MATCHED');
});
test('a client-event reusing different bytes is rejected before staging', async () => {
  await assert.rejects(() => createLabelIngestion({ organizationId: org, actorStaffId: 2, clientEventId: '00000000-0000-4000-8000-000000000007', observedAt: '2026-09-18T00:00:00.000Z', fileBasename: 'label.pdf', bytes: Buffer.from('%PDF-x') }, { query: async () => ({ rows: [row('RECEIVED', { sha256: 'b'.repeat(64) })] }), store: { put: async () => { throw new Error('must not stage'); }, get: async () => Buffer.alloc(0) } }), (error: unknown) => error instanceof LabelIngestionServiceError && error.code === 'CLIENT_EVENT_PAYLOAD_MISMATCH');
});

const evidence = { parserVersion: 'shipstation-api-v1', cycleforgeReference: null, marketplaceOrderId: 'A-1', accountSource: null, trackingNumberRaw: '1Z999AA10123456784', trackingNumberNormalized: '1Z999AA10123456784', carrier: 'UPS', multiPackageEvidence: false };
const ssInput = (over: Partial<ShipStationLabelIngestionInput> = {}): ShipStationLabelIngestionInput => ({ organizationId: org, shipmentId: 42, labelId: 'se-42', observedAt: '2026-09-24T00:00:00.000Z', fileBasename: 'shipstation-se-42.pdf', bytes: Buffer.from('%PDF-ss'), evidence, exactOrder: { accountSource: 'ebay', marketplaceOrderId: 'A-1', matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null }, quarantineReason: null, ...over });

test('shipstation: a shipment already in the ledger replays without staging or inserting (PDF bytes differ per download)', async () => {
  const result = await recordShipStationLabelIngestion(ssInput(), { query: async () => ({ rows: [row('APPLIED', { source: 'SHIPSTATION_API', shipstation_shipment_id: '42', sha256: 'c'.repeat(64) })] }), store: { put: async () => { throw new Error('must not stage'); }, get: async () => Buffer.alloc(0) }, transaction: async () => { throw new Error('must not write'); } });
  assert.equal(result.outcome, 'REPLAYED'); assert.equal(result.ingestion.shipstationShipmentId, 42); assert.equal(result.ingestion.state, 'APPLIED');
});
test('shipstation: identical bytes under another row are a DUPLICATE_PDF, not a second ingestion', async () => {
  const result = await recordShipStationLabelIngestion(ssInput(), { query: async () => ({ rows: [row('QUARANTINED', { id: 9, shipstation_shipment_id: null })] }), store: { put: async () => { throw new Error('must not stage'); }, get: async () => Buffer.alloc(0) } });
  assert.equal(result.outcome, 'DUPLICATE_PDF'); assert.equal(result.ingestion.id, 9);
});
test('shipstation: a new label is staged first, then born settled with its shipment identity', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []; const staged: string[] = [];
  const result = await recordShipStationLabelIngestion(ssInput({ exactOrder: null, quarantineReason: 'ORDER_NOT_FOUND' }), { query: async () => ({ rows: [] }), store: { put: async ({ objectKey }) => { staged.push(objectKey); }, get: async () => Buffer.alloc(0) }, transaction: async (_org, fn) => fn({ query: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return { rows: [row('QUARANTINED', { source: 'SHIPSTATION_API', shipstation_shipment_id: 42, shipstation_label_id: 'se-42' })] }; } } as never) });
  assert.equal(result.outcome, 'CREATED'); assert.equal(staged.length, 1); assert.match(staged[0]!, /^label-ingestions\/.+\.pdf$/);
  const insert = calls[0]!;
  assert.equal(insert.values[1], shipStationClientEventId(42)); assert.equal(insert.values[6], 'QUARANTINED'); assert.equal(insert.values[16], 'ORDER_NOT_FOUND'); assert.equal(insert.values[17], 42); assert.equal(insert.values[18], 'se-42');
});
test('shipstation: the client event id is a stable UUID per shipment', () => {
  assert.equal(shipStationClientEventId(42), shipStationClientEventId(42)); assert.notEqual(shipStationClientEventId(42), shipStationClientEventId(43));
  assert.match(shipStationClientEventId(42), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('shipstation: a label must carry exactly one of an exact order or an exception reason', async () => {
  const noop = { query: async () => ({ rows: [] }), store: { put: async () => {}, get: async () => Buffer.alloc(0) } };
  await assert.rejects(() => recordShipStationLabelIngestion(ssInput({ exactOrder: null }), noop), (e: unknown) => e instanceof LabelIngestionServiceError && e.code === 'INGESTION_PROCESSING_FAILED');
  await assert.rejects(() => recordShipStationLabelIngestion(ssInput({ quarantineReason: 'ORDER_NOT_FOUND' }), noop), (e: unknown) => e instanceof LabelIngestionServiceError && e.code === 'INGESTION_PROCESSING_FAILED');
  await assert.rejects(() => recordShipStationLabelIngestion(ssInput({ bytes: Buffer.from('<html>') }), noop), (e: unknown) => e instanceof LabelIngestionServiceError && e.code === 'INVALID_PDF');
});
test('shipstation: finalizing an APPLIED row is a no-op; a stale row version is refused', async () => {
  const tx = (state: string, version: number, sqls: string[]) => ({ transaction: async (_org: unknown, fn: (c: never) => unknown) => fn({ query: async (sql: string) => { sqls.push(sql); return { rows: [row(state, { source: 'SHIPSTATION_API', row_version: version })] }; } } as never) }) as never;
  const replay: string[] = [];
  const applied = await markShipStationIngestionApplied(org, { ingestionId: 7, expectedRowVersion: 1, orderIds: [3], shipmentId: 4, documentId: 5 }, tx('APPLIED', 2, replay));
  assert.equal(applied.state, 'APPLIED'); assert.equal(replay.length, 1);
  const stale: string[] = [];
  await assert.rejects(() => markShipStationIngestionApplied(org, { ingestionId: 7, expectedRowVersion: 1, orderIds: [3], shipmentId: 4, documentId: 5 }, tx('MATCHED', 3, stale)), (e: unknown) => e instanceof LabelIngestionServiceError && e.code === 'INGESTION_NOT_ACTIONABLE');
  assert.equal(stale.length, 1);
});

test('deleteUnlinkedLabelIngestion deletes only an unpaired row, audits it, then removes the staged object', async () => {
  const sql: string[] = [];
  const objects: string[] = [];
  const result = await deleteUnlinkedLabelIngestion(
    { organizationId: org, actorStaffId: 2, ingestionId: 7 },
    {
      transaction: async (_org, fn) => fn({ query: async (text: string) => {
        sql.push(text);
        return text.includes('SELECT')
          ? { rows: [row('QUARANTINED', { staged_object_key: 'label-ingestions/o/a.pdf' })] }
          : { rows: [] };
      } } as never),
      store: { put: async () => {}, get: async () => Buffer.alloc(0), delete: async ({ objectKey }) => { objects.push(objectKey); } },
    },
  );
  assert.deepEqual(result, { id: 7, objectKey: 'label-ingestions/o/a.pdf' });
  assert.ok(sql.some((text) => text.includes('audit_logs')));
  assert.ok(sql.some((text) => text.includes('DELETE FROM label_ingestions')));
  assert.deepEqual(objects, ['label-ingestions/o/a.pdf']);
});

test('deleteUnlinkedLabelIngestion refuses a matched or APPLIED row before delete', async () => {
  for (const candidate of [row('MATCHED', { matched_order_id: 12 }), row('APPLIED', { matched_order_id: 12 })]) {
    const sql: string[] = [];
    await assert.rejects(
      deleteUnlinkedLabelIngestion(
        { organizationId: org, actorStaffId: 2, ingestionId: 7 },
        { transaction: async (_org, fn) => fn({ query: async (text: string) => { sql.push(text); return { rows: [candidate] }; } } as never) },
      ),
      (error: unknown) => error instanceof LabelIngestionServiceError && error.code === 'INGESTION_NOT_ACTIONABLE',
    );
    assert.ok(!sql.some((text) => text.includes('DELETE FROM label_ingestions')));
  }
});
