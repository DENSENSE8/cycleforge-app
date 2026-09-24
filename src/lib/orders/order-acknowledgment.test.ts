import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import type { LiveOrderLabel } from '@/lib/outbound/live-label';
import { acknowledgeOrder, unacknowledgeOrder, type OrderAcknowledgmentDeps } from './order-acknowledgment';

const ORG = '11111111-1111-4111-8111-111111111111' as OrgId;

const LIVE: LiveOrderLabel = { live: true, documentId: 5, source: 'marketplace_manual:ebay', tracking: '9400111899560000000000', carrier: 'USPS', shipstationLabelId: null, shipmentId: 8 };
const NONE: LiveOrderLabel = { live: false, documentId: null, source: null, tracking: null, carrier: null, shipstationLabelId: null, shipmentId: null };

interface Captured { transactions: OrgId[]; queries: { text: string; values: readonly unknown[] }[]; labelReads: number[] }

function fakes({ exists = true, label = LIVE, skuCatalogId = 31 }: { exists?: boolean; label?: LiveOrderLabel | null; skuCatalogId?: number | null } = {}) {
  const cap: Captured = { transactions: [], queries: [], labelReads: [] };
  const client = {
    query: async (text: string, values: readonly unknown[]) => {
      cap.queries.push({ text, values });
      if (/FOR UPDATE/.test(text)) {
        return { rows: exists ? [{ id: 875, acknowledged_at: null, acknowledged_by: null, fulfillment_route: null, sku_catalog_id: skuCatalogId }] : [] };
      }
      const cleared = /acknowledged_at = NULL/.test(text);
      return { rows: [{ id: 875, acknowledged_at: cleared ? null : '2026-09-23T15:00:00.000Z', acknowledged_by: cleared ? null : values[2], fulfillment_route: cleared ? null : values[3] }] };
    },
  };
  const deps: OrderAcknowledgmentDeps = {
    transaction: async (organizationId, fn) => { cap.transactions.push(organizationId); return fn(client as never); },
    readLiveLabel: async (_organizationId, orderId) => { cap.labelReads.push(orderId); return label; },
  };
  return { deps, cap };
}

const updates = (cap: Captured) => cap.queries.filter((q) => /^\s*UPDATE orders/.test(q.text));

test('an order without a live label is refused and nothing is written', async () => {
  const { deps, cap } = fakes({ label: NONE });
  const result = await acknowledgeOrder({ orderId: 875, organizationId: ORG, route: 'PICK', staffId: 7 }, deps);
  assert.deepEqual(result, { ok: false, reason: 'not_ready', missing: ['label'] });
  assert.deepEqual(updates(cap), []);
});

test('an unpaired order is refused until it is paired, alongside any missing label', async () => {
  const unpaired = fakes({ skuCatalogId: null });
  assert.deepEqual(
    await acknowledgeOrder({ orderId: 875, organizationId: ORG, route: 'PICK', staffId: 7 }, unpaired.deps),
    { ok: false, reason: 'not_ready', missing: ['pairing'] },
  );
  assert.deepEqual(updates(unpaired.cap), []);
  const neither = fakes({ skuCatalogId: null, label: NONE });
  assert.deepEqual(
    await acknowledgeOrder({ orderId: 875, organizationId: ORG, route: 'PICK', staffId: 7 }, neither.deps),
    { ok: false, reason: 'not_ready', missing: ['pairing', 'label'] },
  );
  assert.deepEqual(updates(neither.cap), []);
});

test('an order outside the caller org is not found and its label is never read', async () => {
  const { deps, cap } = fakes({ exists: false });
  const result = await acknowledgeOrder({ orderId: 875, organizationId: ORG, route: 'QC', staffId: 7 }, deps);
  assert.deepEqual(result, { ok: false, reason: 'not_found' });
  assert.deepEqual(cap.labelReads, []);
  assert.deepEqual(updates(cap), []);
  // The lock query is org-scoped by value, not only by the tenant GUC.
  assert.deepEqual(cap.queries[0]?.values, [875, ORG]);
});

test('acknowledging with a live label stamps the route and staff inside the caller org', async () => {
  const { deps, cap } = fakes();
  const result = await acknowledgeOrder({ orderId: 875, organizationId: ORG, route: 'QC', staffId: 7 }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.after, { orderId: 875, acknowledgedAt: '2026-09-23T15:00:00.000Z', acknowledgedBy: 7, route: 'QC' });
  assert.deepEqual(cap.transactions, [ORG]);
  assert.deepEqual(cap.labelReads, [875]);
  assert.deepEqual(updates(cap).map((q) => q.values), [[875, ORG, 7, 'QC']]);
});

test('undo clears the acknowledgment; an unknown order is not found', async () => {
  const { deps } = fakes();
  const undone = await unacknowledgeOrder({ orderId: 875, organizationId: ORG }, deps);
  assert.deepEqual(undone.ok && undone.after, { orderId: 875, acknowledgedAt: null, acknowledgedBy: null, route: null });
  const missing = fakes({ exists: false });
  assert.deepEqual(await unacknowledgeOrder({ orderId: 875, organizationId: ORG }, missing.deps), { ok: false, reason: 'not_found' });
  assert.deepEqual(updates(missing.cap), []);
});
