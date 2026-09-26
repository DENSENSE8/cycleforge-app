/** Shared dual-fire cache-invalidation primitive (Phase 1 / B7). */
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';

/** Injectable seam so callers unit-test the exact (scope, tags) tuples DB/Redis-free. */
export interface ViewInvalidationDeps {
  invalidateLegacy: (tags: string[]) => Promise<void>;
  invalidateOrg: (orgId: string, tags: string[]) => Promise<void>;
}

const defaultViewInvalidationDeps: ViewInvalidationDeps = {
  invalidateLegacy: (tags) => invalidateCacheTags(tags),
  invalidateOrg: (orgId, tags) => invalidateCacheTags(orgId, tags),
};

/** Fire a domain's legacy (GLOBAL_ORG) tags and its org-scoped v2 tags in one call. */
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
