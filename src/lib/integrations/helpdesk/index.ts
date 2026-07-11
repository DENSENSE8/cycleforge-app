/**
 * Helpdesk capability resolution — `getHelpdeskProvider(orgId)` is how product
 * code obtains a ticket backend ("Integrations as SoT" program, Wave B2).
 *
 * SERVER-ONLY (reads the vault via capability-connections). Routes call
 * `getHelpdeskProvider(ctx.organizationId)` and map a null / not-configured
 * result to their existing 503 with capability-first copy — never a
 * hardcoded vendor check in product code.
 *
 * Connection semantics come from src/lib/integrations/capability-connections:
 * a vault-connected connector exposing the 'helpdesk' capability, or (dogfood
 * transitional) the USAV env-credential bridge — so USAV never soft-disables.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { connectedProviderKey } from '@/lib/integrations/capability-connections';
import { capabilityNoun, capabilityTitle, integrationsHubHref } from '@/lib/integrations/capability-labels';
import { createZendeskHelpdeskProvider } from './zendesk-adapter';
import type { HelpdeskProvider } from './types';

export type * from './types';

/** Capability-first operator copy for "no helpdesk connected" (503) responses. */
export const HELPDESK_NOT_CONNECTED_MESSAGE = `${capabilityTitle('helpdesk')} is not connected`;
export const HELPDESK_CONNECT_HINT = `Connect a ${capabilityNoun('helpdesk')} in Settings → Integrations (${integrationsHubHref()}).`;

/** Thrown by requireHelpdeskProvider when no helpdesk capability is connected.
 *  Routes map this to their existing not-configured 503. */
export class HelpdeskNotConnectedError extends Error {
  constructor(message = `${HELPDESK_NOT_CONNECTED_MESSAGE} — ${HELPDESK_CONNECT_HINT}`) {
    super(message);
    this.name = 'HelpdeskNotConnectedError';
  }
}

/**
 * The org's helpdesk backend, or null when the 'helpdesk' capability is not
 * connected (no vault connection and, for the dogfood org, no env creds).
 */
export async function getHelpdeskProvider(orgId: OrgId): Promise<HelpdeskProvider | null> {
  const key = await connectedProviderKey(orgId, 'helpdesk');
  if (key == null) return null;
  // Zendesk is the only helpdesk adapter today. The connector registry can't
  // currently name another helpdesk-capable provider, but guard anyway so a
  // future connector without an adapter degrades to "not connected" instead
  // of a runtime crash.
  if (key !== 'zendesk') return null;
  return createZendeskHelpdeskProvider(orgId);
}

/** Like getHelpdeskProvider, but throws {@link HelpdeskNotConnectedError}. */
export async function requireHelpdeskProvider(orgId: OrgId): Promise<HelpdeskProvider> {
  const provider = await getHelpdeskProvider(orgId);
  if (!provider) throw new HelpdeskNotConnectedError();
  return provider;
}
