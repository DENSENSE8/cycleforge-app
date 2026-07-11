import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInboundSettings, isInboundSourceEnabled, type InboundSettingsDeps } from './org-settings';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as unknown as OrgId;

interface FakeOpts {
  settings?: unknown;
  inventoryProvider?: string | null;
  hasBuyer?: boolean;
}

/** DB-free deps; captures whether the connection probes were consulted. */
function fakes(opts: FakeOpts = {}) {
  const calls = { inventoryProbe: 0, buyerProbe: 0 };
  const deps: InboundSettingsDeps = {
    query: (async () => ({ rows: [{ settings: opts.settings ?? {} }] })) as InboundSettingsDeps['query'],
    inventoryProviderKey: async () => {
      calls.inventoryProbe += 1;
      return opts.inventoryProvider ?? null;
    },
    hasEbayBuyerAccount: async () => {
      calls.buyerProbe += 1;
      return opts.hasBuyer ?? false;
    },
  };
  return { deps, calls };
}

test('never chose + zoho inventory + ebay buyer → connection-driven default', async () => {
  const { deps } = fakes({ settings: {}, inventoryProvider: 'zoho', hasBuyer: true });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['zoho', 'ebay', 'manual']);
  // non-source fields keep their schema defaults
  assert.equal(s.displaySourceAfterMerge, 'ebay');
  assert.equal(s.fuzzyMergeRequiresReview, true);
  assert.deepEqual(s.autoMergeSignals, ['tracking', 'order_number']);
});

test('never chose + nothing connected → manual only (no hardcoded vendors)', async () => {
  const { deps } = fakes({ settings: {} });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['manual']);
});

test('never chose + only an ebay buyer account → ebay + manual', async () => {
  const { deps } = fakes({ settings: {}, inventoryProvider: null, hasBuyer: true });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['ebay', 'manual']);
});

test('never chose + non-zoho inventory provider → no zoho', async () => {
  const { deps } = fakes({ settings: {}, inventoryProvider: 'netsuite', hasBuyer: false });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['manual']);
});

test('explicit persisted enabledSources kept verbatim; probes never consulted', async () => {
  const { deps, calls } = fakes({
    settings: { inbound: { enabledSources: ['zoho'] } },
    inventoryProvider: 'zoho',
    hasBuyer: true,
  });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['zoho']);
  assert.equal(calls.inventoryProbe, 0);
  assert.equal(calls.buyerProbe, 0);
});

test('explicitly EMPTY persisted enabledSources is a choice — kept, not re-derived', async () => {
  const { deps, calls } = fakes({
    settings: { inbound: { enabledSources: [] } },
    inventoryProvider: 'zoho',
    hasBuyer: true,
  });
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, []);
  assert.equal(calls.inventoryProbe, 0);
  assert.equal(calls.buyerProbe, 0);
});

test('persisted inbound block: other fields read, unset ones default', async () => {
  const { deps } = fakes({
    settings: {
      inbound: { displaySourceAfterMerge: 'zoho', enabledSources: ['zoho'], autoMergeSignals: ['tracking'], fuzzyMergeRequiresReview: false },
    },
  });
  const s = await resolveInboundSettings(ORG, deps);
  assert.equal(s.displaySourceAfterMerge, 'zoho');
  assert.deepEqual(s.enabledSources, ['zoho']);
  assert.deepEqual(s.autoMergeSignals, ['tracking']);
  assert.equal(s.fuzzyMergeRequiresReview, false);
  // unset field falls back to default
  assert.deepEqual(s.zohoOrderNumberFields, ['reference_number', 'notes']);
});

test('missing org (null) → legacy compatibility default', async () => {
  const s = await resolveInboundSettings(null);
  assert.deepEqual(s.enabledSources, ['zoho', 'ebay']);
});

test('settings query failure → legacy compatibility default', async () => {
  const { deps } = fakes({ inventoryProvider: 'zoho', hasBuyer: true });
  deps.query = async () => {
    throw new Error('db down');
  };
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['zoho', 'ebay']);
});

test('connection-probe failure degrades enabledSources to the legacy floor only', async () => {
  const { deps } = fakes({
    settings: { inbound: { fuzzyMergeRequiresReview: false } },
  });
  deps.inventoryProviderKey = async () => {
    throw new Error('vault down');
  };
  const s = await resolveInboundSettings(ORG, deps);
  assert.deepEqual(s.enabledSources, ['zoho', 'ebay']);
  // the rest of the persisted policy survives the probe failure
  assert.equal(s.fuzzyMergeRequiresReview, false);
});

test('invalid persisted settings → whole block falls back → connection-derived', async () => {
  const { deps } = fakes({
    settings: { inbound: { displaySourceAfterMerge: 'shopify', enabledSources: ['zoho'] } },
    inventoryProvider: 'zoho',
  });
  const s = await resolveInboundSettings(ORG, deps);
  assert.equal(s.displaySourceAfterMerge, 'ebay'); // invalid enum → whole block falls back
  assert.deepEqual(s.enabledSources, ['zoho', 'manual']);
});

test('isInboundSourceEnabled is registry + enabled-list gated (fail-closed)', async () => {
  const { deps } = fakes({ settings: { inbound: { enabledSources: ['zoho', 'ebay'] } } });
  const s = await resolveInboundSettings(ORG, deps);
  assert.equal(isInboundSourceEnabled(s, 'ebay'), true);
  assert.equal(isInboundSourceEnabled(s, 'EBAY'), true); // case-insensitive
  assert.equal(isInboundSourceEnabled(s, 'amazon'), false); // registered but not enabled
  assert.equal(isInboundSourceEnabled(s, 'shopify'), false); // unregistered → never enabled
});
