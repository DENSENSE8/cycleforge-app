import test from 'node:test';
import assert from 'node:assert/strict';
import { syncOneInboundPurchase, type SyncOneInboundDeps } from './sync-one-inbound';
import type { OrgId } from '@/lib/tenancy/constants';
import type { InboundOrgSettings } from '@/lib/tenancy/settings';
import { inboundOrderIdentity, type InboundOrderDraft } from './inbound-order-draft';
import { EBAY_PURCHASE_SYNC_OVERLAP_MS } from './sync-ebay-purchases';

const ORG = '00000000-0000-0000-0000-000000000001' as unknown as OrgId;

const ENABLED_SETTINGS: InboundOrgSettings = {
  enabledSources: ['zoho', 'ebay'],
  displaySourceAfterMerge: 'ebay',
  zohoOrderNumberFields: ['reference_number'],
  autoMergeSignals: ['tracking'],
  fuzzyMergeRequiresReview: true,
};

const NOW = Date.parse('2026-10-03T12:00:00.000Z');

function landedResult(draft: InboundOrderDraft, created: boolean) {
  return { inboundOrderId: 1, created, unchanged: false, identity: inboundOrderIdentity(draft), lines: [], receivingId: null, localPickupOrderId: null };
}

function baseDeps(overrides: Partial<SyncOneInboundDeps> = {}): SyncOneInboundDeps {
  return {
    isUniversalEnabled: async () => true,
    resolveSettings: async () => ENABLED_SETTINGS,
    listBuyerAccounts: async () => [{ accountName: 'Buyer-1' }],
    fetchPurchases: async () => [],
    ingest: (async (_o: OrgId, raw: unknown) => landedResult(raw as InboundOrderDraft, false)) as SyncOneInboundDeps['ingest'],
    getCursor: async () => null,
    syncAllEbay: async () => ({
      orgId: ORG, accounts: 1, ordersFetched: 0, linesFetched: 0, landed: 0, updated: 0, unchanged: 0, failed: 0, errors: [],
    }),
    findShipmentId: async () => null,
    pollShipment: (async () => ({ ok: true, status: 'in_transit' })) as SyncOneInboundDeps['pollShipment'],
    now: () => NOW,
    ...overrides,
  };
}

test('flag off → blocked', async () => {
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'ebay', sourceOrderId: 'E-1' }, baseDeps({
    isUniversalEnabled: async () => false,
  }));
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /not enabled/);
});

test('source disabled for org → blocked', async () => {
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'ebay', sourceOrderId: 'E-1' }, baseDeps({
    resolveSettings: async () => ({ ...ENABLED_SETTINGS, enabledSources: ['zoho'] }),
  }));
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /not enabled/);
});

test('no buyer accounts → error', async () => {
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'ebay', sourceOrderId: 'E-1' }, baseDeps({
    listBuyerAccounts: async () => [],
  }));
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /buyer account/);
});

test('lands the whole matching order (every line) and nothing else, in the overlap window', async () => {
  const drafts: InboundOrderDraft[] = [];
  const sinces: Array<string | null> = [];
  const lastRun = new Date(NOW - 60 * 60 * 1000);
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'ebay', sourceOrderId: '111-1' }, baseDeps({
    getCursor: async () => lastRun,
    fetchPurchases: async (_o, _a, since) => {
      sinces.push(since);
      return [
        { sourceOrderId: 'E-42', sourceLineItemId: '111-1', legacyOrderId: '111-1', itemName: 'A' },
        { sourceOrderId: 'E-42', sourceLineItemId: '222-1', itemName: 'B' },
        { sourceOrderId: 'OTHER', itemName: 'C' },
      ];
    },
    ingest: (async (_o: OrgId, raw: unknown) => {
      drafts.push(raw as InboundOrderDraft);
      return landedResult(raw as InboundOrderDraft, true);
    }) as SyncOneInboundDeps['ingest'],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.marketplace?.landed, 1);
  assert.equal(r.marketplace?.linesFetched, 2);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].orderNumber, 'E-42');
  assert.deepEqual(drafts[0].lines.map((l) => l.lineKey), ['111-1', '222-1']);
  assert.deepEqual(sinces, [new Date(lastRun.getTime() - EBAY_PURCHASE_SYNC_OVERLAP_MS).toISOString()]);
});

test('re-polls shipment when one is linked', async () => {
  let polled = false;
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'ebay', sourceOrderId: 'E-1' }, baseDeps({
    fetchPurchases: async () => [{ sourceOrderId: 'E-1', sku: 'A' }],
    findShipmentId: async () => 55,
    pollShipment: (async () => { polled = true; return { ok: true, status: 'delivered' }; }) as SyncOneInboundDeps['pollShipment'],
  }));
  assert.equal(polled, true);
  assert.equal(r.shipment.polled, true);
  assert.equal(r.shipment.status, 'delivered');
});

test('amazon → not available yet', async () => {
  const r = await syncOneInboundPurchase(ORG, { sourceType: 'amazon', sourceOrderId: 'AMZ-1' }, baseDeps({
    resolveSettings: async () => ({ ...ENABLED_SETTINGS, enabledSources: ['zoho', 'ebay', 'amazon'] }),
  }));
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /Amazon/);
});
