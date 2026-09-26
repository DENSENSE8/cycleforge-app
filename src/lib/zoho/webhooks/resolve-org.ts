/** Webhook → org resolution (Wave 3). */

import {
  getIntegrationCredentials,
  type ZohoCredentials,
} from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveOrgByWebhookToken } from './zoho-webhook-credentials';
import type { NormalizedZohoEvent } from './types';

type ResolveOrgResult =
  | {
      ok: true;
      orgId: OrgId;
      /** Per-org secret used to verify the HMAC. */
      signingSecret: string;
      source: 'token';
    }
  | { ok: false; status: 401 | 404; reason: string };

interface ResolveOrgDeps {
  resolveToken: typeof resolveOrgByWebhookToken;
  getCredentials: (orgId: OrgId) => Promise<ZohoCredentials | null>;
}

const DEFAULT_DEPS: ResolveOrgDeps = {
  resolveToken: resolveOrgByWebhookToken,
  getCredentials: (orgId) => getIntegrationCredentials<ZohoCredentials>(orgId, 'zoho'),
};

/**
 * Resolve the org a webhook delivery belongs to (before the body is parsed, so
 * the right secret is chosen for signature verification).
 */
export async function resolveOrgFromWebhook(params: {
  token?: string | null;
}, deps: ResolveOrgDeps = DEFAULT_DEPS): Promise<ResolveOrgResult> {
  const token = (params.token || '').trim();
  if (!token) {
    return { ok: false, status: 401, reason: 'webhook token required' };
  }

  const orgId = await deps.resolveToken(token);
  if (!orgId) {
    // Unknown/revoked token — opaque to the caller, logged by the route.
    return { ok: false, status: 404, reason: 'unknown webhook token' };
  }
  const creds = await deps.getCredentials(orgId);
  const signingSecret = creds?.webhookSecret?.trim();
  if (!signingSecret) {
    return { ok: false, status: 401, reason: 'webhook secret not provisioned for org' };
  }
  return { ok: true, orgId, signingSecret, source: 'token' };
}

/** Cross-check that a verified event actually came from the Zoho account this org connected. */
export async function assertEventFromOrgZohoAccount(
  orgId: OrgId,
  event: NormalizedZohoEvent,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const eventZohoOrg = (event.organizationId || '').trim();
  if (!eventZohoOrg) return { ok: true }; // nothing to validate against

  const creds = await getIntegrationCredentials<ZohoCredentials>(orgId, 'zoho');
  const connectedZohoOrg = (creds?.orgId || '').trim();
  if (!connectedZohoOrg) {
    return { ok: false, reason: `org ${orgId} has no connected Zoho account id` };
  }

  if (eventZohoOrg !== connectedZohoOrg) {
    return {
      ok: false,
      reason: `event Zoho org ${eventZohoOrg} does not match org ${orgId}'s connected Zoho account`,
    };
  }
  return { ok: true };
}
