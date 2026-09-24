import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabelIngestion, LabelIngestionServiceError } from './ingestion-service';

const org = '00000000-0000-4000-8000-000000000001' as never;
const row = (state: string, extra: Record<string, unknown> = {}) => ({ id: 7, client_event_id: '00000000-0000-4000-8000-000000000007', state, row_version: 1, sha256: 'a'.repeat(64), file_basename: 'label.pdf', byte_size: 10, parser_version: 'v1', match_method: null, tracking_number_raw: null, tracking_number_normalized: null, carrier: null, quarantine_reason_code: null, created_at: new Date('2026-09-18T00:00:00Z'), updated_at: new Date('2026-09-18T00:00:00Z'), staged_object_key: null, source: 'MANUAL_UPLOAD', observed_at: new Date('2026-09-18T00:00:00Z'), matched_account_source: null, matched_marketplace_order_id: null, matched_order_id: null, applied_at: null, ...extra });
test('ingestion stages before parsing and persists the resolver result', async () => {
  const calls: string[] = []; const result = await createLabelIngestion({ organizationId: org, actorStaffId: 2, clientEventId: '00000000-0000-4000-8000-000000000007', observedAt: '2026-09-18T00:00:00.000Z', fileBasename: 'label.pdf', bytes: Buffer.from('%PDF-x') }, {
    query: async () => ({ rows: [] }), transaction: async (_org, fn) => fn({ query: async (sql: string) => { calls.push(sql); return { rows: [row(sql.includes("state='MATCHED'") ? 'MATCHED' : 'RECEIVED')] }; } }), store: { put: async () => { calls.push('store'); }, get: async () => Buffer.from('%PDF-x') }, parse: async () => ({ parserVersion: 'v1', cycleforgeReference: null, marketplaceOrderId: 'ORDER-1', accountSource: 'ebay', trackingNumberRaw: '1Z999AA10123456784', trackingNumberNormalized: '1Z999AA10123456784', carrier: 'UPS', multiPackageEvidence: false }), resolve: async () => ({ exactOrder: { accountSource: 'ebay', marketplaceOrderId: 'ORDER-1', matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null }, orderIds: [12], quarantineReason: null }),
  });
  assert.equal(result.ingestion.state, 'MATCHED'); assert.equal(calls.indexOf('store') < calls.findIndex((call) => call.includes("state='MATCHED'")), true);
});
test('a client-event reusing different bytes is rejected before staging', async () => {
  await assert.rejects(() => createLabelIngestion({ organizationId: org, actorStaffId: 2, clientEventId: '00000000-0000-4000-8000-000000000007', observedAt: '2026-09-18T00:00:00.000Z', fileBasename: 'label.pdf', bytes: Buffer.from('%PDF-x') }, { query: async () => ({ rows: [row('RECEIVED', { sha256: 'b'.repeat(64) })] }), store: { put: async () => { throw new Error('must not stage'); }, get: async () => Buffer.alloc(0) } }), (error: unknown) => error instanceof LabelIngestionServiceError && error.code === 'CLIENT_EVENT_PAYLOAD_MISMATCH');
});
