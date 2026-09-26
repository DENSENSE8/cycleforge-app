/** Zoho Inventory client core — credential resolution, URL building, and access token minting, all scoped to a tenant `orgId`. */

import {
  clearIntegrationError,
  getIntegrationCredentials,
  type ZohoCredentials,
} from '@/lib/integrations/credentials';
import {
  ACCESS_TOKEN_SKEW_MS,
  clearSharedAccessToken,
  getSharedAccessToken,
} from '@/lib/integrations/access-token-store';
import { type OrgId } from '@/lib/tenancy/constants';
import { accountsDomain, buildZohoUrl, getInventoryBaseUrl } from '@/lib/zoho/url';
import {
  formatZohoTokenRefreshBodyError,
  formatZohoTokenRefreshHttpError,
} from '@/lib/zoho/token-refresh-error';

export type { ZohoCredentials };
// Re-exported so existing importers of '@/lib/zoho/core' (and the '@/lib/zoho'
// barrel) keep their import paths; the pure logic now lives in ./url.
export { buildZohoUrl, getInventoryBaseUrl };

/** Thrown when an org has no usable Zoho connection (not connected / revoked). */
export class ZohoNotConnectedError extends Error {
  constructor(public readonly orgId: OrgId) {
    super(
      `No active Zoho connection for org ${orgId}. ` +
        'Connect via Settings → Integrations (/api/zoho/oauth/authorize).',
    );
    this.name = 'ZohoNotConnectedError';
  }
}

// ─── Per-org access-token cache (in-process; short-lived) ───────────────────
// First layer only. The authoritative cache is the shared DB row, so a cold
// instance costs a DB read, not a Zoho mint.
interface CachedAccessToken { token: string; expiresAt: number; }
const accessTokenCache = new Map<OrgId, CachedAccessToken>();

function isComplete(creds: ZohoCredentials | null | undefined): creds is ZohoCredentials {
  return Boolean(creds && creds.refreshToken && creds.clientId && creds.clientSecret && creds.orgId);
}

/** Load the tenant's Zoho credentials via `getIntegrationCredentials` (vault SoT; USAV env bridge only when no vault row exists — never… */
export async function loadZohoCredentials(
  orgId: OrgId,
  opts: { includeInactive?: boolean } = {},
): Promise<ZohoCredentials> {
  const vault = await getIntegrationCredentials<ZohoCredentials>(orgId, 'zoho', {
    ...(opts.includeInactive ? { includeInactive: true } : {}),
  });
  if (isComplete(vault)) return vault;
  throw new ZohoNotConnectedError(orgId);
}

/** A valid short-lived access token for the tenant. */
export async function getAccessToken(orgId: OrgId, creds?: ZohoCredentials): Promise<string> {
  const cached = accessTokenCache.get(orgId);
  if (cached && cached.expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS) return cached.token;

  const c = creds ?? (await loadZohoCredentials(orgId));

  const shared = await getSharedAccessToken(orgId, 'zoho', async () => {
    const tokenUrl = `https://${accountsDomain(c)}/oauth/v2/token`;
    const params = new URLSearchParams({
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(formatZohoTokenRefreshHttpError(response.status, body));
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (data.error) {
      throw new Error(formatZohoTokenRefreshBodyError(data));
    }
    return {
      token: String(data.access_token || ''),
      expiresInSec: Number(data.expires_in_sec || data.expires_in || 3600),
    };
  });

  // Mirror the SHARED expiry, not a local guess: this instance may have just
  // adopted a token another instance minted 50 minutes ago.
  accessTokenCache.set(orgId, { token: shared.token, expiresAt: shared.expiresAt });

  if (shared.minted) {
    // A fresh mint proves the refresh token is alive — lift any latch.
    void clearIntegrationError(orgId, 'zoho').catch(() => {});
  }
  return shared.token;
}

/**
 * Drop the cached access token for an org (e.g. after a 401), forcing a mint.
 * Clears the SHARED token too — leaving a rejected token in the DB would hand
 * every other instance the same 401.
 */
export function invalidateAccessToken(orgId: OrgId): void {
  accessTokenCache.delete(orgId);
  void clearSharedAccessToken(orgId, 'zoho').catch(() => {});
}
