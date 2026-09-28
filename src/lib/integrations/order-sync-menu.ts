/** Linked order platforms the To-ship Sync runs: ShipStation, the Google Sheets backup, then every other channel. */
import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions';
import { getConnector } from '@/lib/integrations/connectors/registry';
import type { ConnectionStatus } from '@/lib/integrations/connectors/types';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import { syncPermissionForProvider } from '@/lib/integrations/sync-permission';

/**
 * Paint order = run order: the order importer of record, then its sheet
 * backup, then every other linked channel alphabetically.
 */
const PINNED_ORDER: Record<string, number> = { shipstation: 0, google_sheets: 1 };
/** The legacy sheet is a backup source, and says so wherever it is listed. */
const FACE_SUFFIX: Record<string, string> = { google_sheets: ' (backup)' };

type OrderSyncMenuSource = {
  provider: string;
  /** Operator-facing row: `Sync Square · Main store`. */
  label: string;
  canSync: boolean;
};

export interface OrderSyncMenuDeps {
  listConnections: (orgId: OrgId) => Promise<ConnectionStatus[]>;
}

function isSyncableOrderSource(connection: ConnectionStatus): boolean {
  return (
    connection.connected
    && connection.capabilities.includes('orders')
    && Boolean(getConnector(connection.provider)?.sync)
  );
}

/** Build the linked-platform rows (caller appends Link more). */
function buildOrderSyncMenuSources(input: {
  connections: ConnectionStatus[];
  hasPermission: (perm: PermissionString) => boolean;
}): OrderSyncMenuSource[] {
  const seen = new Map<string, number>();
  return input.connections
    .filter(isSyncableOrderSource)
    .map((connection) => ({ connection, catalog: providerCatalogLabel(connection.provider) }))
    .sort(
      (a, b) =>
        (PINNED_ORDER[a.connection.provider] ?? 2) - (PINNED_ORDER[b.connection.provider] ?? 2)
        || a.catalog.localeCompare(b.catalog),
    )
    .map(({ connection, catalog }) => {
      // A display label that repeats the catalog name — whole, or as a
      // `Google Sheets · …` prefix — adds nothing; keep only what follows.
      const raw = (connection.displayLabel ?? '').trim();
      const prefix = `${catalog.toLowerCase()} · `;
      const name = raw.toLowerCase().startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;
      const face = `${catalog}${FACE_SUFFIX[connection.provider] ?? ''}`;
      const base =
        name && name.toLowerCase() !== catalog.toLowerCase() ? `Sync ${face} · ${name}` : `Sync ${face}`;
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
