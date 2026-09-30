/**
 * Short-TTL Redis cache for the helpdesk overview rollup (open-ticket search).
 * Ticket detail no longer caches here — it reads the local ticket mirror
 * (src/lib/support/ticket-mirror.ts).
 */
import { getOrSet, invalidateCacheTags } from '@/lib/cache/upstash-cache';
import type { OrgId } from '@/lib/tenancy/constants';

const ZENDESK_CACHE_NS = 'zendesk';

/** Overview search rollup TTL. */
const ZENDESK_OVERVIEW_TTL_SEC = 120;

const ZENDESK_OVERVIEW_TAG = 'zendesk-overview';

/** Drop the overview rollup after a ticket write (subject/status/new ticket). */
export async function invalidateZendeskOverviewCache(orgId: OrgId): Promise<void> {
  await invalidateCacheTags(orgId, [ZENDESK_OVERVIEW_TAG]);
}

export async function getOrSetZendeskOverview<T>(
  orgId: OrgId,
  limit: number,
  loader: () => Promise<T>,
): Promise<T> {
  return getOrSet(
    ZENDESK_CACHE_NS,
    orgId,
    `overview:${limit}`,
    ZENDESK_OVERVIEW_TTL_SEC,
    [ZENDESK_OVERVIEW_TAG],
    loader,
  );
}
