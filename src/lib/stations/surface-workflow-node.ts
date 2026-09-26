/** Surface → Studio workflow-node resolution (ops-events unification, Phase 2). */

import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSurface, type ResolveSurfaceDeps } from './surface-resolver';
import type { SurfaceKey } from './surface-keys';

const NODE_CACHE_TTL_MS = 60_000;
const nodeCache = new Map<string, { value: string | null; at: number }>();

/** The Studio node the org has bound to this surface, or null when no active `station_definitions` row exists / carries a… */
export async function resolveSurfaceWorkflowNodeId(
  key: SurfaceKey,
  orgId: OrgId,
  deps?: ResolveSurfaceDeps,
): Promise<string | null> {
  const cacheKey = `${orgId}:${key}`;
  if (!deps) {
    const cached = nodeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < NODE_CACHE_TTL_MS) return cached.value;
  }
  try {
    const resolved = await resolveSurface(key, orgId, deps);
    const value = resolved.definition?.workflowNodeId ?? null;
    if (!deps) nodeCache.set(cacheKey, { value, at: Date.now() });
    return value;
  } catch (err) {
    console.warn(`[surface-workflow-node] resolve failed for ${key} (non-fatal):`, err);
    return null;
  }
}
