/**
 * Canonical post-write cache invalidation for the FBA read models (Phase 1 / B7).
 *
 * Mirrors `src/lib/orders/invalidation.ts`. FBA writers today already dual-write
 * `[fba-board, fba-today, fba-stage-counts]` inline on adjacent legacy + v2 lines
 * (~19 routes); this helper collapses that boilerplate to one call. The
 * `fba-stage-counts` tag is currently invalidated but never set — wrapping
 * `/api/fba/stage-counts` in Phase 2 (B2) activates it, at which point this helper
 * already busts it correctly.
 */
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
