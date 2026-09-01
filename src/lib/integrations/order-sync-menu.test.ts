/**
 * Run: npx tsx --test src/lib/integrations/order-sync-menu.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ConnectionStatus } from '@/lib/integrations/connectors/types';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { PermissionString } from '@/lib/auth/permissions';
import {
  listOrderSyncMenuSources,
  type OrderSyncMenuDeps,
} from './order-sync-menu';
import { syncPermissionForProvider } from './sync-permission';

const ORG = 'org-test' as OrgId;

function conn(
  provider: IntegrationProvider,
  extra: Partial<ConnectionStatus> = {},
): ConnectionStatus {
  return {
    provider,
    connected: true,
    state: 'active',
    authKind: 'vault',
    capabilities: ['orders'],
    ...extra,
  };
}

function fakes(input: {
  connections?: ConnectionStatus[];
  ebay?: { accountName: string }[];
  amazon?: { accountName: string }[];
}) {
  const cap = { orgs: [] as OrgId[] };
  const deps: OrderSyncMenuDeps = {
    listConnections: async (orgId) => {
      cap.orgs.push(orgId);
      return input.connections ?? [];
    },
    listEbaySellerAccounts: async (orgId) => {
      cap.orgs.push(orgId);
      return input.ebay ?? [];
    },
    listAmazonAccounts: async (orgId) => {
      cap.orgs.push(orgId);
      return input.amazon ?? [];
    },
  };
  return { deps, cap };
}

const canImport = (perm: PermissionString) => perm === 'orders.import';
const canAll = () => true;

test('syncPermissionForProvider matches the integrations sync route', () => {
  assert.equal(syncPermissionForProvider('ebay'), 'integrations.ebay');
  assert.equal(syncPermissionForProvider('amazon'), 'integrations.amazon');
  assert.equal(syncPermissionForProvider('ecwid'), 'orders.import');
  assert.equal(syncPermissionForProvider('google_sheets'), 'orders.import');
  assert.equal(syncPermissionForProvider('shopify'), 'admin.manage_features');
});

test('lists connected Ecwid by integration connection name', async () => {
  const { deps, cap } = fakes({
    connections: [conn('ecwid', { displayLabel: 'Ecwid store 16593703' })],
  });
  const out = await listOrderSyncMenuSources(ORG, canImport, deps);
  assert.equal(cap.orgs[0], ORG);
  assert.deepEqual(out, [
    {
      provider: 'ecwid',
      label: 'Sync Ecwid · Ecwid store 16593703',
      canSync: true,
    },
  ]);
});

test('omits Google Sheets (dock face) and non-order vault rows', async () => {
  const { deps } = fakes({
    connections: [
      conn('google_sheets', { displayLabel: 'USAV sheet' }),
      conn('zoho', { displayLabel: 'Connected · USAV', capabilities: ['inventory'] }),
      conn('zendesk', { displayLabel: 'Zendesk', capabilities: ['helpdesk'] }),
    ],
  });
  const out = await listOrderSyncMenuSources(ORG, canAll, deps);
  assert.deepEqual(out, []);
});

test('named eBay / Amazon accounts beat vault rows and keep connection names', async () => {
  const { deps } = fakes({
    ebay: [{ accountName: 'USAV' }],
    amazon: [{ accountName: 'FBA NA' }],
    connections: [
      conn('ebay', { displayLabel: 'vault ebay', scope: 'seller:USAV' }),
      conn('amazon', { displayLabel: 'vault amazon' }),
    ],
  });
  const out = await listOrderSyncMenuSources(ORG, (perm) => perm.startsWith('integrations.'), deps);
  assert.deepEqual(
    out.map((row) => row.label),
    ['Sync eBay · USAV', 'Sync Amazon · FBA NA'],
  );
  assert.equal(out[0]?.canSync, true);
  assert.equal(out[1]?.canSync, true);
});

test('vault eBay seller scope fills in when the account table is empty', async () => {
  const { deps } = fakes({
    connections: [conn('ebay', { displayLabel: null, scope: 'seller:USAV' })],
  });
  const out = await listOrderSyncMenuSources(ORG, () => false, deps);
  assert.deepEqual(out, [
    { provider: 'ebay', label: 'Sync eBay · USAV', canSync: false },
  ]);
});

test('skips eBay buyer vault scopes', async () => {
  const { deps } = fakes({
    connections: [conn('ebay', { displayLabel: 'Purchasing', scope: 'buyer:Purchasing' })],
  });
  const out = await listOrderSyncMenuSources(ORG, canAll, deps);
  assert.deepEqual(out, []);
});

test('duplicate connection names get a numeric suffix', async () => {
  const { deps } = fakes({
    ebay: [{ accountName: 'Store' }, { accountName: 'Store' }],
  });
  const out = await listOrderSyncMenuSources(ORG, canAll, deps);
  assert.deepEqual(
    out.map((row) => row.label),
    ['Sync eBay · Store', 'Sync eBay · Store (2)'],
  );
});
