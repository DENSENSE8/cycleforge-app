/**
 * Short-TTL Redis cache for Zendesk read surfaces — cuts repeat quota burn when
 * the support console, overview tile, and warranty flows hit the same ticket.
 */
import { getOrSet, invalidateCacheTags } from '@/lib/cache/upstash-cache';
import type { OrgId } from '@/lib/tenancy/constants';

export const ZENDESK_CACHE_NS = 'zendesk';

/** Bundle payload TTL — stale-while-revalidate window for ticket detail. */
export const ZENDESK_BUNDLE_TTL_SEC = 90;

/** Overview search rollup TTL. */
export const ZENDESK_OVERVIEW_TTL_SEC = 120;

export function zendeskTicketCacheTags(ticketId: number): string[] {
  return [`zendesk-ticket:${ticketId}`, 'zendesk-overview'];
}

export async function invalidateZendeskTicketCache(orgId: OrgId, ticketId: number): Promise<void> {
  await invalidateCacheTags(orgId, zendeskTicketCacheTags(ticketId));
}

export async function invalidateZendeskOverviewCache(orgId: OrgId): Promise<void> {
  await invalidateCacheTags(orgId, ['zendesk-overview']);
}

export function zendeskBundleCacheKey(ticketId: number): string {
  return `bundle:${ticketId}`;
}

export function zendeskOverviewCacheKey(limit: number): string {
  return `overview:${limit}`;
}

export async function getOrSetZendeskBundle<T>(
  orgId: OrgId,
  ticketId: number,
  loader: () => Promise<T>,
): Promise<T> {
  return getOrSet(
    ZENDESK_CACHE_NS,
    orgId,
    zendeskBundleCacheKey(ticketId),
    ZENDESK_BUNDLE_TTL_SEC,
    zendeskTicketCacheTags(ticketId),
    loader,
  );
}

export async function getOrSetZendeskOverview<T>(
  orgId: OrgId,
  limit: number,
  loader: () => Promise<T>,
): Promise<T> {
  return getOrSet(
    ZENDESK_CACHE_NS,
    orgId,
    zendeskOverviewCacheKey(limit),
    ZENDESK_OVERVIEW_TTL_SEC,
    ['zendesk-overview'],
    loader,
  );
}
