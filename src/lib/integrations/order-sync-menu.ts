/**
 * Connected order-ingestion sources for the To-ship Sync Google Sheet chevron.
 *
 * Google Sheets is the dock face — it is not repeated here. eBay seller /
 * Amazon account tables win when they have rows; otherwise vault
 * `organization_integrations` connections with the `orders` capability and a
 * wired `sync()` fill in (Ecwid, Shopify, Square, ShipStation, scoped eBay).
 *
 * Pure given deps — the load file supplies the DB defaults so unit tests stay
 * off the Neon pool.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions';
import { parseEbayAccountScope } from '@/lib/ebay/oauth-config';
import { getConnector } from '@/lib/integrations/connectors/registry';
import type { ConnectionStatus } from '@/lib/integrations/connectors/types';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import { syncPermissionForProvider } from '@/lib/integrations/sync-permission';

/** Face of the To-ship sliced dock — not a chevron row. */
export const TO_SHIP_SYNC_FACE_PROVIDER = 'google_sheets';

export type OrderSyncMenuSource = {
  provider: string;
  /** Operator-facing row: `Sync eBay · USAV`. */
  label: string;
  canSync: boolean;
};

export type NamedAccount = { accountName: string };

export interface OrderSyncMenuDeps {
  listConnections: (orgId: OrgId) => Promise<ConnectionStatus[]>;
  listEbaySellerAccounts: (orgId: OrgId) => Promise<NamedAccount[]>;
  listAmazonAccounts: (orgId: OrgId) => Promise<NamedAccount[]>;
}

function uniqueLabel(seen: Map<string, number>, base: string): string {
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base} (${n})`;
}

function connectionName(catalog: string, displayLabel?: string | null, scopeSlug?: string | null): string | null {
  const name = (displayLabel ?? '').trim() || (scopeSlug ?? '').trim();
  if (!name) return null;
  if (name.toLowerCase() === catalog.toLowerCase()) return null;
  return name;
}

function syncLabel(catalog: string, name: string | null): string {
  return name ? `Sync ${catalog} · ${name}` : `Sync ${catalog}`;
}

function isSyncableOrderSource(connection: ConnectionStatus): boolean {
  if (!connection.connected) return false;
  if (connection.provider === TO_SHIP_SYNC_FACE_PROVIDER) return false;
  if (!connection.capabilities.includes('orders')) return false;
  const connector = getConnector(connection.provider);
  return Boolean(connector?.sync);
}

function pushSource(
  items: OrderSyncMenuSource[],
  seen: Map<string, number>,
  provider: string,
  name: string | null,
  hasPermission: (perm: PermissionString) => boolean,
): void {
  const catalog = providerCatalogLabel(provider);
  items.push({
    provider,
    label: uniqueLabel(seen, syncLabel(catalog, name)),
    canSync: hasPermission(syncPermissionForProvider(provider)),
  });
}

/**
 * Build the chevron's connected-platform rows (caller appends Sync more).
 *
 * Order: named eBay sellers, named Amazon accounts, then other vault order
 * sources alphabetically by catalog label.
 */
export function buildOrderSyncMenuSources(input: {
  connections: ConnectionStatus[];
  ebaySellerAccounts: NamedAccount[];
  amazonAccounts: NamedAccount[];
  hasPermission: (perm: PermissionString) => boolean;
}): OrderSyncMenuSource[] {
  const seen = new Map<string, number>();
  const named = new Set<string>();
  const head: OrderSyncMenuSource[] = [];
  const rest: OrderSyncMenuSource[] = [];

  for (const row of input.ebaySellerAccounts) {
    const name = row.accountName.trim();
    if (!name) continue;
    named.add('ebay');
    pushSource(head, seen, 'ebay', name, input.hasPermission);
  }

  for (const row of input.amazonAccounts) {
    const name = row.accountName.trim();
    if (!name) continue;
    named.add('amazon');
    pushSource(head, seen, 'amazon', name, input.hasPermission);
  }

  const vault: ConnectionStatus[] = [];
  for (const connection of input.connections) {
    if (!isSyncableOrderSource(connection)) continue;
    if (named.has(connection.provider)) continue;
    if (connection.provider === 'ebay') {
      const parsed = parseEbayAccountScope(connection.scope);
      if (parsed?.role === 'buyer') continue;
    }
    vault.push(connection);
  }

  vault.sort((a, b) => {
    const rank = (provider: string) => (provider === 'ebay' ? 0 : provider === 'amazon' ? 1 : 2);
    const d = rank(a.provider) - rank(b.provider);
    if (d !== 0) return d;
    return providerCatalogLabel(a.provider).localeCompare(providerCatalogLabel(b.provider));
  });

  for (const connection of vault) {
    const parsed = connection.provider === 'ebay' ? parseEbayAccountScope(connection.scope) : null;
    const name = connectionName(
      providerCatalogLabel(connection.provider),
      connection.displayLabel,
      parsed?.accountSlug ?? null,
    );
    const bucket = connection.provider === 'ebay' || connection.provider === 'amazon' ? head : rest;
    pushSource(bucket, seen, connection.provider, name, input.hasPermission);
  }

  return [...head, ...rest];
}

export async function listOrderSyncMenuSources(
  orgId: OrgId,
  hasPermission: (perm: PermissionString) => boolean,
  deps: OrderSyncMenuDeps,
): Promise<OrderSyncMenuSource[]> {
  const [connections, ebaySellerAccounts, amazonAccounts] = await Promise.all([
    deps.listConnections(orgId),
    deps.listEbaySellerAccounts(orgId),
    deps.listAmazonAccounts(orgId),
  ]);
  return buildOrderSyncMenuSources({
    connections,
    ebaySellerAccounts,
    amazonAccounts,
    hasPermission,
  });
}
