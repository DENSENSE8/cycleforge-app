/** The mobile receiving feed's react-query keys — shared by the client hook that owns the feed (`MobileReceivingList`) and the server seed… */
export type MobileFeedSurface = 'triage' | 'unbox';

export const mobileFeedQueryKey = (surface: MobileFeedSurface) =>
  surface === 'triage'
    ? (['receiving-lines-table', 'rail', 'scanned', 'mobile-triage'] as const)
    : (['receiving-lines-table', 'rail', 'unbox-opened', 'mobile-unbox'] as const);

/** Rows the SERVER SEED paints. */
export const MOBILE_FEED_SEED_LIMIT = 20;

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
