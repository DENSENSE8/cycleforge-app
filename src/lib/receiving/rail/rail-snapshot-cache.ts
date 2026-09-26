/** Shared constants + key helpers for the receiving sidebar-rail first-paint seed. */

/** Seed lifetime. Long enough to survive a reload, short enough that a seed is
 *  never meaningfully old before the authoritative query replaces it. */
export const RAIL_SNAPSHOT_TTL_SECONDS = 60;
/** Rows kept per feed — matches the rail's top-N window; more just wastes space. */
export const RAIL_SNAPSHOT_MAX_ROWS = 30;

/** Client-composed feed identity — everything that changes WHICH rows a rail shows, except the viewer (the server adds that) and free-text… */
export function railSnapshotFeedParam(parts: {
  feedId: string;
  scope?: string | null;
  staffFilterId?: number | null;
}): string {
  return [parts.feedId, parts.scope ?? 'default', parts.staffFilterId ?? 'all'].join(':');
}

/**
 * Redis key = client feed identity + viewer, for per-staff isolation on shared
 * terminals (the `viewed` feed is per-viewer, and no staffer should ever seed
 * from another's rows). `orgId` is a separate `getCachedJson` argument.
 */
export function railSnapshotCacheKey(
  feedParam: string,
  viewerStaffId: number | null | undefined,
): string {
  return `${feedParam}:v${viewerStaffId ?? 'all'}`;
}
