/**
 * Canonical post-write cache invalidation for the receiving read models (Phase 1 / B7).
 *
 * Mirrors `src/lib/orders/invalidation.ts`. Composes the shared dual-fire primitive
 * so a receiving write busts both the org-less legacy snapshots in place today
 * (`api:receiving-logs`, `api:pending-unboxing`, `api:receiving-entry`) AND the
 * org-scoped v2 read models wrapped in Phase 2 (the receiving-incoming cluster:
 * summary / details / counts / delivered lanes, all tagged `receiving-lines`).
 *
 * ADOPTION: call sites are converted from ad-hoc `invalidateCacheTags([...])` to
 * this helper in Phase 2 alongside wrapping each read. Until a receiving read is
 * wrapped v2, the org-scoped branch is a harmless no-op (no v2 entry to evict).
 */
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateDomainViews, type ViewInvalidationDeps } from '@/lib/cache/view-invalidation';

/** Legacy tags consumed by the org-less receiving reads still in place today. */
const RECEIVING_LEGACY_TAGS = [
  CACHE_TAGS.receivingLogs,
  CACHE_TAGS.receivingLines,
  CACHE_TAGS.pendingUnboxing,
] as const;

/** Org-scoped v2 tags for the receiving-incoming read models (Phase 2 targets). */
const RECEIVING_V2_TAGS = [
  CACHE_TAGS.receivingLines,
  CACHE_TAGS.receivingLogs,
  CACHE_TAGS.pendingUnboxing,
] as const;

export function invalidateReceivingViews(
  organizationId: string | null | undefined,
  extraTags: string[] = [],
  deps?: ViewInvalidationDeps,
): Promise<void> {
  return invalidateDomainViews(organizationId, RECEIVING_LEGACY_TAGS, RECEIVING_V2_TAGS, extraTags, deps);
}
