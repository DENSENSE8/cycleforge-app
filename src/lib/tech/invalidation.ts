/**
 * Canonical post-write cache invalidation for the tech/repair read models (Phase 1 / B7).
 *
 * Mirrors `src/lib/orders/invalidation.ts`. `tech/scan` already busts
 * `[orders, orders-next, tech-logs, order-detail]` org-scoped inline; this helper
 * bundles that set (plus the legacy `tech-logs` snapshot `api:tech-logs-v3`) so the
 * other tech/repair writers (scan-sku, serial, delete, repair-service routes),
 * which today bust legacy-only, can adopt one org-scoped call in Phase 2. That is
 * what closes the order-detail / ops-dashboard staleness the audit flagged for the
 * tech-side writers.
 */
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateDomainViews, type ViewInvalidationDeps } from '@/lib/cache/view-invalidation';

/** Legacy tags consumed by the org-less tech reads (api:tech-logs-v3, api:orders-next). */
const TECH_LEGACY_TAGS = [
  CACHE_TAGS.techLogs,
  CACHE_TAGS.ordersNext,
] as const;

/** Org-scoped v2 tags — includes the order read models a tech verdict changes. */
const TECH_V2_TAGS = [
  CACHE_TAGS.techLogs,
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
