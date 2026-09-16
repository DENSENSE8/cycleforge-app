/**
 * Zoho connector validate adapter (INT-011) — thin adapter over the
 * /api/zoho/health check logic: resolve this org's Zoho credentials from the
 * vault (env bridge for the dogfood org) and confirm the stored refresh token
 * still mints an access token. Lazily imported by the registry so the
 * lightweight connection reader never pulls in the Zoho client.
 *
 * With `allowInactive` it also validates a connection latched to
 * `status='error'` — that is how the hourly self-heal sweep proves a
 * throttle-latched connection is alive again and lifts the latch instead of
 * waiting for a human to re-run OAuth.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { getAccessToken, loadZohoCredentials, ZohoNotConnectedError } from '@/lib/zoho/core';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import type { HealthResult, ValidateOpts } from './types';

export async function zohoValidate(
  orgId: OrgId,
  opts: ValidateOpts = {},
): Promise<HealthResult> {
  // 1. Is there a usable connection for this tenant?
  let creds;
  try {
    creds = await loadZohoCredentials(orgId, {
      ...(opts.allowInactive ? { includeInactive: true } : {}),
    });
  } catch (err) {
    if (err instanceof ZohoNotConnectedError) {
      return { ok: false, error: 'No Zoho connection for this organization.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load Zoho credentials' };
  }
  const connection = {
    zohoOrganizationId: creds.orgId,
    dataCenter: creds.domain || 'accounts.zoho.com',
  };

  // 2. Live check — the stored refresh token still mints an access token. Pass
  //    the creds we already hold so a latched row does not re-hit the
  //    status-gated read and fail as "not connected".
  try {
    const token = await withZohoOrg(orgId, () => getAccessToken(orgId, creds));
    if (!token) return { ok: false, error: 'Token mint returned empty.', detail: { connection } };
    return { ok: true, detail: { connection } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Token mint failed',
      detail: { connection },
    };
  }
}
