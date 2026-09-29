import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPurchaseLabelIngestion,
  recordPurchaseLabelIngestion,
  type PurchaseLabelIngestionDeps,
} from './label-purchase-ingestion';
import { shipStationClientEventId, type PublicLabelIngestion } from '@/lib/label-ingestions/ingestion-service';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const ORDER = { order_id: '112-7788', account_source: 'amazon' };
const LABEL = { labelId: 'se-4242', trackingNumber: '9400 1000 0000 0000 0000 01', carrierCode: 'stamps_com' };

const plan = (over: Partial<Parameters<typeof planPurchaseLabelIngestion>[0]> = {}) =>
  planPurchaseLabelIngestion({ order: ORDER, label: LABEL, labelFormat: 'pdf', purpose: 'outbound', ...over });

test('plan: the client event is stable per bought label and distinct across labels', () => {
  const a = plan();
  const again = plan({ order: { order_id: '112-7788', account_source: 'amazon' } });
  const other = plan({ label: { ...LABEL, labelId: 'se-4243' } });
  assert.equal(a.kind, 'record');
  assert.equal(again.kind, 'record');
  assert.equal(other.kind, 'record');
  if (a.kind !== 'record' || again.kind !== 'record' || other.kind !== 'record') return;
  assert.equal(a.clientEventId, again.clientEventId);
  assert.notEqual(a.clientEventId, other.clientEventId);
  // Same identity the ShipStation label source claims, so a backfill converges on the same row.
  assert.equal(a.clientEventId, shipStationClientEventId(4242));
  assert.equal(a.shipstationShipmentId, 4242);
});

test('plan: an order with its number and account source matches exactly; otherwise it is quarantined for pairing', () => {
  const matched = plan();
  assert.equal(matched.kind, 'record');
  if (matched.kind !== 'record') return;
  assert.deepEqual(matched.exactOrder, { accountSource: 'amazon', marketplaceOrderId: '112-7788', matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null });
  assert.equal(matched.quarantineReason, null);
  assert.equal(matched.evidence.trackingNumberNormalized, '9400100000000000000001');
  assert.equal(matched.evidence.carrier, 'USPS');

  for (const order of [{ order_id: null, account_source: 'amazon' }, { order_id: '112-7788', account_source: '  ' }]) {
    const quarantined = plan({ order });
    assert.equal(quarantined.kind, 'record');
    if (quarantined.kind !== 'record') return;
    assert.equal(quarantined.exactOrder, null);
    assert.equal(quarantined.quarantineReason, 'MISSING_ACCOUNT_CONTEXT');
  }
});

test('plan: returns, non-PDF formats, non-ShipStation ids and tracking-less labels are not ingested', () => {
  assert.deepEqual(plan({ purpose: 'return' }), { kind: 'skip', reason: 'RETURN_LABEL' });
  assert.deepEqual(plan({ labelFormat: 'zpl' }), { kind: 'skip', reason: 'NOT_PDF' });
  assert.deepEqual(plan({ label: { ...LABEL, labelId: 'lbl-1' } }), { kind: 'skip', reason: 'NO_SHIPMENT_ID' });
  assert.deepEqual(plan({ label: { ...LABEL, trackingNumber: ' ' } }), { kind: 'skip', reason: 'NO_TRACKING' });
});

const ingestion = (state: PublicLabelIngestion['state'], id = 91): PublicLabelIngestion =>
  ({ id, state, rowVersion: 1, shipstationShipmentId: 4242 }) as PublicLabelIngestion;

function fakeDeps(existing: PublicLabelIngestion | null, recordedState: PublicLabelIngestion['state'] = 'MATCHED') {
  const calls: string[] = [];
  const applied: unknown[] = [];
  const deps: PurchaseLabelIngestionDeps = {
    findByShipment: async () => existing,
    record: async () => {
      calls.push('record');
      return { ingestion: ingestion(recordedState), outcome: 'CREATED' };
    },
    markApplied: async (_org, input) => {
      calls.push('apply');
      applied.push(input);
      return ingestion('APPLIED');
    },
    link: async () => {
      calls.push('link');
    },
    now: () => new Date('2026-09-28T00:00:00Z'),
  };
  return { deps, calls, applied };
}

const input = (over: Partial<Parameters<typeof recordPurchaseLabelIngestion>[0]> = {}) => ({
  orgId: ORG,
  orderId: 5501,
  order: ORDER,
  label: LABEL,
  labelFormat: 'pdf',
  purpose: 'outbound' as const,
  staffId: 3,
  trackingShipmentId: 77,
  labelDocumentId: 88,
  loadBytes: async () => Buffer.from('%PDF-1.7'),
  ...over,
});

test('record: a fresh label is recorded once and finalized APPLIED on its order, tracking row and document', async () => {
  const { deps, calls, applied } = fakeDeps(null);
  const result = await recordPurchaseLabelIngestion(input(), deps);
  assert.deepEqual(result, { labelIngestionId: 91, warning: null });
  assert.deepEqual(calls, ['record', 'apply']);
  assert.deepEqual(applied, [{ ingestionId: 91, expectedRowVersion: 1, orderIds: [5501], shipmentId: 77, documentId: 88 }]);
});

test('record: a replay reuses the recorded row — no second ingestion, no re-download', async () => {
  const { deps, calls } = fakeDeps(ingestion('APPLIED', 12));
  const result = await recordPurchaseLabelIngestion(
    input({ loadBytes: async () => assert.fail('a recorded label must not be downloaded again') }),
    deps,
  );
  assert.deepEqual(result, { labelIngestionId: 12, warning: null });
  assert.deepEqual(calls, []);
});

test('record: an order without an exact identity is paired by LINKING the quarantined row', async () => {
  const { deps, calls } = fakeDeps(null, 'QUARANTINED');
  const result = await recordPurchaseLabelIngestion(input({ order: { order_id: null, account_source: null } }), deps);
  assert.deepEqual(result, { labelIngestionId: 91, warning: null });
  assert.deepEqual(calls, ['record', 'link']);
});

test('record: a label bought with no order is recorded unpaired — never linked or applied', async () => {
  const { deps, calls } = fakeDeps(null, 'QUARANTINED');
  const result = await recordPurchaseLabelIngestion(
    input({ orderId: null, order: { order_id: null, account_source: null }, trackingShipmentId: null, labelDocumentId: null }),
    deps,
  );
  assert.deepEqual(result, { labelIngestionId: 91, warning: null });
  assert.deepEqual(calls, ['record']);
});

test('record: without the stored document the row stays MATCHED and the purchase says so', async () => {
  const { deps, calls } = fakeDeps(null);
  const result = await recordPurchaseLabelIngestion(input({ labelDocumentId: null }), deps);
  assert.equal(result.labelIngestionId, 91);
  assert.match(result.warning ?? '', /not yet paired/);
  assert.deepEqual(calls, ['record']);
});
