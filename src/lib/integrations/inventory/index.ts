/** Inventory capability facade — resolution entry point (Wave B1). */
import type { OrgId } from '@/lib/tenancy/constants';
import { connectedProviderKey } from '@/lib/integrations/capability-connections';
import { ZohoInventoryProviderAdapter } from './zoho-adapter';
import type { InventoryProvider } from './types';

export type {
  InventoryProvider,
  InventoryProviderClientStatus,
  InventoryProviderHealth,
} from './types';

/**
 * Thrown by requireInventoryProvider when the org has no usable inventory
 * connection (mirrors ZohoNotConnectedError in src/lib/zoho/core.ts) so
 * callers surface a connect prompt instead of a generic 500.
 */
class InventoryNotConnectedError extends Error {
  constructor(public readonly orgId: OrgId) {
    super(
      `No inventory integration connected for org ${orgId}. ` +
        'Connect one via Settings → Integrations (/settings/integrations).',
    );
    this.name = 'InventoryNotConnectedError';
  }
}

/** The org's inventory provider, or null when no connector is connected. */
export async function getInventoryProvider(orgId: OrgId): Promise<InventoryProvider | null> {
  const key = await connectedProviderKey(orgId, 'inventory');
  if (key === 'zoho') return new ZohoInventoryProviderAdapter(orgId);
  return null;
}

/** Like getInventoryProvider, but throws InventoryNotConnectedError on none. */
export async function requireInventoryProvider(orgId: OrgId): Promise<InventoryProvider> {
  const provider = await getInventoryProvider(orgId);
  if (!provider) throw new InventoryNotConnectedError(orgId);
  return provider;
}
