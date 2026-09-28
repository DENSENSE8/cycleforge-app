/**
 * Run: npx tsx --test src/lib/integrations/order-sync-menu.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ConnectionStatus } from '@/lib/integrations/connectors/types';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { PermissionString } from '@/lib/auth/permissions';
import { listOrderSyncMenuSources, type OrderSyncMenuDeps } from './order-sync-menu';
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

function fakes(connections: ConnectionStatus[]) {
  const cap = { orgs: [] as OrgId[] };
  const deps: OrderSyncMenuDeps = {
    listConnections: async (orgId) => {
      cap.orgs.push(orgId);
      return connections;
    },
  };
  return { deps, cap };
}

const canAll = () => true;

test('syncPermissionForProvider: ShipStation and the sheet backup are operator import, every other sync is admin', () => {
  assert.equal(syncPermissionForProvider('shipstation'), 'orders.import');
  assert.equal(syncPermissionForProvider('google_sheets'), 'orders.import');
  assert.equal(syncPermissionForProvider('square'), 'admin.manage_features');
  assert.equal(syncPermissionForProvider('shopify'), 'admin.manage_features');
});

test('lists a wired order sync by connection name, gated by its permission', async () => {
  const { deps, cap } = fakes([conn('square', { displayLabel: 'Main store' })]);
  const out = await listOrderSyncMenuSources(
    ORG,
    (perm: PermissionString) => perm === 'orders.import',
    deps,
  );
  assert.equal(cap.orgs[0], ORG);
  assert.deepEqual(out, [{ provider: 'square', label: 'Sync Square · Main store', canSync: false }]);
});

test('lists ShipStation first, the sheet backup second; omits syncless and non-order rows', async () => {
  const { deps } = fakes([
    conn('square', { displayLabel: 'Store' }),
    conn('google_sheets', { capabilities: ['orders', 'tracking'], displayLabel: 'Google Sheets · Order List Sep 2026' }),
    conn('shipstation', { displayLabel: 'ShipStation', capabilities: ['orders', 'tracking', 'labels'] }),
    conn('ups', { capabilities: ['tracking'] }),
    conn('ebay', { displayLabel: 'USAV', scope: 'seller:USAV' }),
    conn('zoho', { displayLabel: 'Connected · USAV', capabilities: ['inventory'] }),
    conn('shopify', { connected: false }),
  ]);
  const out = await listOrderSyncMenuSources(ORG, (perm) => perm === 'orders.import', deps);
  assert.deepEqual(out, [
    { provider: 'shipstation', label: 'Sync ShipStation', canSync: true },
    { provider: 'google_sheets', label: 'Sync Google Sheets (backup) · Order List Sep 2026', canSync: true },
    { provider: 'square', label: 'Sync Square · Store', canSync: false },
  ]);
});

test('sorts by catalog label and suffixes duplicate names', async () => {
  const { deps } = fakes([
    conn('square', { displayLabel: 'Store' }),
    conn('shopify', { displayLabel: 'Store' }),
    conn('square', { displayLabel: 'Store' }),
  ]);
  const out = await listOrderSyncMenuSources(ORG, canAll, deps);
  assert.deepEqual(
    out.map((row) => row.label),
    ['Sync Shopify · Store', 'Sync Square · Store', 'Sync Square · Store (2)'],
  );
});
