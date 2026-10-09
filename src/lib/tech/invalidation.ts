/** Canonical post-write cache invalidation for the tech/repair read models (Phase 1 / B7). */
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateDomainViews, type ViewInvalidationDeps } from '@/lib/cache/view-invalidation';

/** Legacy tags consumed by the org-less tech reads (api:desk-pick-logs-v4, api:orders-next). */
const TECH_LEGACY_TAGS = [
  CACHE_TAGS.deskPickLogs,
  CACHE_TAGS.ordersNext,
] as const;

/** Org-scoped v2 tags — includes the order read models a tech verdict changes. */
const TECH_V2_TAGS = [
  CACHE_TAGS.deskPickLogs,
  CACHE_TAGS.ordersNext,
  CACHE_TAGS.orders,
  CACHE_TAGS.orderDetail,
] as const;

export function invalidateTechViews(
  organizationId: string | null | undefined,
  extraTags: string[] = [],
  deps?: ViewInvalidationDeps,
): Promise<void> {
  return invalidateDomainViews(organizationId, TECH_LEGACY_TAGS, TECH_V2_TAGS, extraTags, deps);
}
