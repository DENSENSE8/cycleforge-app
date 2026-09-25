/**
 * Connected order-ingestion sources for the To-ship Sync ShipStation chevron.
 *
 * ShipStation is the dock face — it is not repeated here. The rows are vault
 * `organization_integrations` connections with the `orders` capability and a
 * wired `sync()` (Square, Shopify), alphabetical by catalog label. eBay,
 * Amazon and Ecwid have no connector sync any more, so they never list.
 *
 * Pure given deps — the load file supplies the DB defaults so unit tests stay
 * off the Neon pool.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions';
import { getConnector } from '@/lib/integrations/connectors/registry';
import type { ConnectionStatus } from '@/lib/integrations/connectors/types';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import { syncPermissionForProvider } from '@/lib/integrations/sync-permission';

/** Face of the To-ship sliced dock — not a chevron row. */
export const TO_SHIP_SYNC_FACE_PROVIDER = 'shipstation';

export type OrderSyncMenuSource = {
  provider: string;
  /** Operator-facing row: `Sync Square · Main store`. */
  label: string;
  canSync: boolean;
};

export interface OrderSyncMenuDeps {
  listConnections: (orgId: OrgId) => Promise<ConnectionStatus[]>;
}

function isSyncableOrderSource(connection: ConnectionStatus): boolean {
  if (!connection.connected) return false;
  if (connection.provider === TO_SHIP_SYNC_FACE_PROVIDER) return false;
  if (!connection.capabilities.includes('orders')) return false;
  return Boolean(getConnector(connection.provider)?.sync);
}

/** Build the chevron's connected-platform rows (caller appends Sync more). */
export function buildOrderSyncMenuSources(input: {
  connections: ConnectionStatus[];
  hasPermission: (perm: PermissionString) => boolean;
}): OrderSyncMenuSource[] {
  const seen = new Map<string, number>();
  return input.connections
    .filter(isSyncableOrderSource)
    .map((connection) => ({ connection, catalog: providerCatalogLabel(connection.provider) }))
    .sort((a, b) => a.catalog.localeCompare(b.catalog))
    .map(({ connection, catalog }) => {
      // A display label that just repeats the catalog name adds nothing.
      const name = (connection.displayLabel ?? '').trim();
      const base =
        name && name.toLowerCase() !== catalog.toLowerCase()
          ? `Sync ${catalog} · ${name}`
          : `Sync ${catalog}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        provider: connection.provider,
        label: n === 1 ? base : `${base} (${n})`,
        canSync: input.hasPermission(syncPermissionForProvider(connection.provider)),
      };
    });
}

export async function listOrderSyncMenuSources(
  orgId: OrgId,
  hasPermission: (perm: PermissionString) => boolean,
  deps: OrderSyncMenuDeps,
): Promise<OrderSyncMenuSource[]> {
  return buildOrderSyncMenuSources({ connections: await deps.listConnections(orgId), hasPermission });
}
