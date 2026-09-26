/** Canonical post-write cache invalidation for the FBA read models (Phase 1 / B7). */
import { CACHE_TAGS } from '@/lib/cache/tags';
import { invalidateDomainViews, type ViewInvalidationDeps } from '@/lib/cache/view-invalidation';

/** FBA board / today / stage-count read models — same tag set for legacy + v2. */
const FBA_TAGS = [
  CACHE_TAGS.fbaBoard,
  CACHE_TAGS.fbaToday,
  CACHE_TAGS.fbaStageCounts,
] as const;

export function invalidateFbaViews(
  organizationId: string | null | undefined,
  extraTags: string[] = [],
  deps?: ViewInvalidationDeps,
): Promise<void> {
  return invalidateDomainViews(organizationId, FBA_TAGS, FBA_TAGS, extraTags, deps);
}
