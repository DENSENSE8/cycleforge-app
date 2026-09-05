/**
 * The mobile receiving feed's react-query keys — shared by the client hook that
 * owns the feed (`MobileReceivingList`) and the server seed that paints it
 * (removed 2026-09-02 — see `/m/home`).
 *
 * They live here rather than next to either one because a seed only works while
 * both sides agree on the key to the character. When these drifted the seed
 * still dehydrated fine, the client still fetched fine, and the only symptom was
 * the feed painting a second later — the exact failure the seed exists to stop.
 *
 * Each mobile surface mirrors a desktop rail: Unbox mirrors `view=unbox_opened`,
 * Triage mirrors `view=scanned&sort=priority`. Distinct keys so the two surfaces
 * never share a stale cache entry, and both sit under the
 * `receiving-lines-table` prefix so broad invalidations still refresh them.
 */
export type MobileFeedSurface = 'triage' | 'unbox';

export const mobileFeedQueryKey = (surface: MobileFeedSurface) =>
  surface === 'triage'
    ? (['receiving-lines-table', 'rail', 'scanned', 'mobile-triage'] as const)
    : (['receiving-lines-table', 'rail', 'unbox-opened', 'mobile-unbox'] as const);

/** The list request the feed makes — one definition, used by hook and seed. */
export function mobileFeedParams(
  surface: MobileFeedSurface,
  limit: number = 100,
): URLSearchParams {
  const params = new URLSearchParams({
    // Display windows to ≤20 rows (useCaptureStackWindow) — 100 gives
    // carton-grouping headroom; the old 500-row window was pure over-fetch.
    limit: String(limit),
    offset: '0',
    include: 'serials',
  });
  if (surface === 'triage') {
    params.set('view', 'scanned');
    params.set('sort', 'priority');
  } else {
    params.set('view', 'unbox_opened');
  }
  return params;
}
