/**
 * Capability → connection resolution (SERVER-ONLY — reads the vault).
 *
 * The org-aware half of the capability-first labeling program: product
 * surfaces ask "is capability X connected?" / "what should I call the
 * connected provider?" instead of assuming a vendor. Feature gates and
 * soft-disable checks go through here — never through a hardcoded
 * provider-specific check in product code.
 *
 *   const on = await isCapabilityConnected(orgId, 'inventory');
 *   const label = await connectedProviderLabel(orgId, 'inventory'); // "Zoho Inventory"
 *
 * Client-safe label vocabulary lives in ./capability-labels.ts.
 *
 * DOGFOOD TRANSITIONAL: the USAV org may still resolve credentials from env
 * (see credentials.ts envFallback) without a vault row. Until token-SoT
 * Phase 5 removes that bridge, capability checks fall back to a credential
 * probe for the dogfood org only, so capability gating cannot soft-disable
 * surfaces that actually work there.
 */
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
import { listConnections } from '@/lib/integrations/connectors/connections';
import type { Capability, ConnectionStatus } from '@/lib/integrations/connectors/types';
import { capabilityTitle, providerCatalogLabel } from './capability-labels';
import { connectorsWithCapability } from '@/lib/integrations/connectors/registry';
import type { IntegrationProvider } from '@/lib/integrations/credentials';

/** Provider keys whose connector exposes a capability (behavior SoT). */
export function capabilityProviderKeys(cap: Capability): IntegrationProvider[] {
  return connectorsWithCapability(cap).map((c) => c.provider);
}

/** Active connections whose connector exposes `cap`, in catalog order. */
export async function getConnectedProviders(
  orgId: OrgId,
  cap: Capability,
): Promise<ConnectionStatus[]> {
  const connections = await listConnections(orgId);
  return connections.filter((c) => c.connected && c.capabilities.includes(cap));
}

/**
 * True when some connector with `cap` is usable for this org — vault-connected,
 * or (dogfood only, transitional) resolvable via the env-credential bridge.
 */
export async function isCapabilityConnected(orgId: OrgId, cap: Capability): Promise<boolean> {
  const connected = await getConnectedProviders(orgId, cap);
  if (connected.length > 0) return true;
  if (orgId !== DOGFOOD_ORG_ID) return false;
  for (const provider of capabilityProviderKeys(cap)) {
    const creds = await getIntegrationCredentials(orgId, provider);
    if (creds) return true;
  }
  return false;
}

/**
 * What operator copy should call the org's provider for a capability:
 * the connection's display label → the provider's catalog label → the
 * generic capability title when nothing is connected.
 */
export async function connectedProviderLabel(orgId: OrgId, cap: Capability): Promise<string> {
  const [first] = await getConnectedProviders(orgId, cap);
  if (first) return first.displayLabel || providerCatalogLabel(first.provider);
  if (orgId === DOGFOOD_ORG_ID) {
    for (const provider of capabilityProviderKeys(cap)) {
      const creds = await getIntegrationCredentials(orgId, provider);
      if (creds) return providerCatalogLabel(provider);
    }
  }
  return capabilityTitle(cap);
}

/** The provider key backing a capability for this org, or null when none. */
export async function connectedProviderKey(
  orgId: OrgId,
  cap: Capability,
): Promise<string | null> {
  const [first] = await getConnectedProviders(orgId, cap);
  if (first) return first.provider;
  if (orgId === DOGFOOD_ORG_ID) {
    for (const provider of capabilityProviderKeys(cap)) {
      const creds = await getIntegrationCredentials(orgId, provider);
      if (creds) return provider;
    }
  }
  return null;
}
