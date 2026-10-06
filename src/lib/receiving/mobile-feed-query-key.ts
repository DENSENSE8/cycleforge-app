/** The mobile receiving feed's react-query keys — shared by the client hooks that read it (`MobileReceivingList`, `useArrivalHistory`). */
export type MobileFeedSurface = 'triage' | 'unbox';

export const mobileFeedQueryKey = (surface: MobileFeedSurface) =>
  surface === 'triage'
    ? (['receiving-lines-table', 'rail', 'scanned', 'mobile-triage'] as const)
    : (['receiving-lines-table', 'rail', 'unbox-opened', 'mobile-unbox'] as const);

/** The list request the feed makes — one definition for every reader. */
export function mobileFeedParams(surface: MobileFeedSurface): URLSearchParams {
  const params = new URLSearchParams({
    // Display windows to ≤20 rows (useCaptureStackWindow) — 100 gives
    // carton-grouping headroom; the old 500-row window was pure over-fetch.
    limit: '100',
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
