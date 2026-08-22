/**
 * Shared dual-fire cache-invalidation primitive (Phase 1 / B7).
 *
 * Promotes the pattern `src/lib/orders/invalidation.ts` (`invalidateAllOrdersApiCaches`)
 * hand-rolls into a reusable SoT so every domain's post-write invalidation stays
 * consistent through the v1→v2 (legacy `GLOBAL_ORG` → org-scoped) strangler.
 *
 * WHY DUAL-FIRE: during the migration a domain's read models are split — some are
 * still the org-less legacy snapshots (`api:receiving-*`, `api:orders`, …), some are
 * org-scoped v2 `getOrSet` reads. A write must bust BOTH:
 *   - legacy tags  → `invalidateCacheTags(tags)`          (GLOBAL_ORG sentinel)
 *   - v2 tags      → `invalidateCacheTags(orgId, tags)`   (org-scoped)
 * When a domain finishes migrating every read to v2 (Phase B8), drop its legacy
 * list and this collapses to a single org-scoped call.
 *
 * The `deps` seam keeps domain view-invalidators unit-testable with zero Redis
 * (mirrors the `Deps`-injection rule in).
 */
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';

/** Injectable seam so callers unit-test the exact (scope, tags) tuples DB/Redis-free. */
export interface ViewInvalidationDeps {
  invalidateLegacy: (tags: string[]) => Promise<void>;
  invalidateOrg: (orgId: string, tags: string[]) => Promise<void>;
}

export const defaultViewInvalidationDeps: ViewInvalidationDeps = {
  invalidateLegacy: (tags) => invalidateCacheTags(tags),
  invalidateOrg: (orgId, tags) => invalidateCacheTags(orgId, tags),
};

/**
 * Fire a domain's legacy (GLOBAL_ORG) tags and its org-scoped v2 tags in one call.
 * `extraTags` are appended to BOTH lists (a caller-supplied cross-cut, e.g. a route
 * that also touched `need-to-order`). No-ops the org branch when `organizationId`
 * is falsy so session-less callers (crons) still bust the legacy snapshot.
 */
export async function invalidateDomainViews(
  organizationId: string | null | undefined,
  legacyTags: readonly string[],
  v2Tags: readonly string[],
  extraTags: readonly string[] = [],
  deps: ViewInvalidationDeps = defaultViewInvalidationDeps,
): Promise<void> {
  const legacy = Array.from(new Set([...legacyTags, ...extraTags].filter(Boolean)));
  if (legacy.length > 0) await deps.invalidateLegacy(legacy);
  if (organizationId) {
    const v2 = Array.from(new Set([...v2Tags, ...extraTags].filter(Boolean)));
    if (v2.length > 0) await deps.invalidateOrg(organizationId, v2);
  }
}
