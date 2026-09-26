/** Canonical post-write cache invalidation for the receiving read models (Phase 1 / B7). */
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
