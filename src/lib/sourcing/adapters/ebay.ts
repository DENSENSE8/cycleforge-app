import pool from '@/lib/db';
import { browseSearch } from '@/lib/ebay/browse-client';
import { getIntegrationCredentials, type EbayCredentials } from '@/lib/integrations/credentials';
import { normalizeEnvValue } from '@/lib/env-utils';
import { normalizeBrowseItems } from '@/lib/sourcing/normalize';
import type { OrgId } from '@/lib/tenancy/constants';
import { buildScourQuery, type ScourRequest, type SourceAdapter } from './types';

/**
 * eBay SourceAdapter — wraps the Browse app-token client. Quota discipline
 * (Browse ~5k/day): one round trip per call, no fan-out; every call is logged
 * to ebay_api_calls. See src/lib/ebay/browse-client.ts.
 */

async function logCall(
  endpoint: string,
  latencyMs: number,
  statusCode: number,
  errorMessage: string | null,
  orgId: OrgId,
) {
  try {
    // ebay_api_calls is tenant-owned with a usav-fallback default — an unstamped
    // insert silently misroutes to USAV. The org is REQUIRED here so the
    // compiler catches an adapter that forgets to thread it; the scour
    // orchestrator always sets ScourRequest.orgId.
    await pool.query(
      `INSERT INTO ebay_api_calls (method, endpoint, latency_ms, status_code, error_message, created_at, organization_id)
       VALUES ('GET', $1, $2, $3, $4, NOW(), $5::uuid)`,
      [endpoint, latencyMs, statusCode, errorMessage, orgId],
    );
  } catch (err) {
    console.warn('[sourcing.ebay] ebay_api_calls log failed:', err instanceof Error ? err.message : err);
  }
}

export const ebayAdapter: SourceAdapter = {
  id: 'ebay',
  label: 'eBay',

  async enabled(orgId) {
    try {
      const creds = await getIntegrationCredentials<EbayCredentials>(orgId, 'ebay');
      return Boolean(creds && normalizeEnvValue(creds.appId) && normalizeEnvValue(creds.certId));
    } catch {
      return false;
    }
  },

  async search(req: ScourRequest) {
    const q = buildScourQuery(req);
    if (!q) return [];

    const startedAt = Date.now();
    try {
      const browse = await browseSearch({
        q,
        conditions: req.conditions,
        maxPriceCents: req.maxPriceCents ?? null,
        limit: req.limit,
        orgId: req.orgId,
      });
      const normalized = normalizeBrowseItems(browse.items);
      await logCall('buy/browse/v1/item_summary/search', Date.now() - startedAt, 200, null, req.orgId);
      return normalized;
    } catch (err) {
      await logCall(
        'buy/browse/v1/item_summary/search',
        Date.now() - startedAt,
        502,
        err instanceof Error ? err.message : String(err),
        req.orgId,
      );
      throw err;
    }
  },
};
