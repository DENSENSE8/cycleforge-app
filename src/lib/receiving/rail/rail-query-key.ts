/**
 * ONE builder for a receiving sidebar-rail's TanStack cache key.
 *
 * The client mount (`ReceivingFeedRail`) and the RSC first-paint seed
 * (`seedUnboxRecentRail`) both compose the key through this function, so the two
 * cannot drift — and a key mismatch silently no-ops the seed (the same class of
 * bug the To-ship `queue-counts-normalize` seed hit). Server-safe: no
 * `'use client'`, no imports, so the seed graph can call it.
 *
 * Shape mirrors the historical inline literal exactly:
 *   ['receiving-lines-table', 'rail', segment, scope ?? 'default', q, staffId ?? 'all']
 *
 * `query` MUST already be trimmed + lowercased by the caller (the mount does
 * `filterText.trim().toLowerCase()`); `staffId` stays a raw number so `?? 'all'`
 * yields a number for a real staff filter (not a string), matching the mount.
 */
export function receivingRailQueryKey(
  segment: string,
  scope: string | undefined,
  query: string,
  staffId: number | null,
): readonly [string, string, string, string, string, string | number] {
  return [
    'receiving-lines-table',
    'rail',
    segment,
    scope ?? 'default',
    query,
    staffId ?? 'all',
  ] as const;
}
