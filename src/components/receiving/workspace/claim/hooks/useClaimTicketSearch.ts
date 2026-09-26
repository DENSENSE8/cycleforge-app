import { useTicketSearch, type UseTicketSearch } from '@/components/support/link/useTicketSearch';

/** Re-exported under the claim flow's local name; the shape is the shared one. */
export type UseClaimTicketSearch = UseTicketSearch;

interface Params {
  open: boolean;
  /** Only search while the link tab is active. */
  enabled: boolean;
  receivingId: number | null | undefined;
  lineId: number | null | undefined;
  /**
   * Seed Link search with a known identifier (carton tracking). Applied once
   * per link-mode enable cycle via {@link useTicketSearch}.
   */
  initialQuery?: string | null;
}

/**
 * Build query params for GET /api/receiving/zendesk-claim/link.
 * Only includes `lineId` when it is a positive integer — `String(null)` /
 * `String(undefined)` would fail Zod on the route.
 */
export function buildClaimTicketSearchParams(args: {
  receivingId: number;
  lineId?: number | null;
  query?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    receivingId: String(args.receivingId),
  });
  if (args.lineId != null && args.lineId > 0) {
    params.set('lineId', String(args.lineId));
  }
  const query = args.query?.trim();
  if (query) params.set('query', query);
  return params;
}

/** Receiving claim-flow ticket search — a thin anchor adapter over the shared {@link useTicketSearch}. */
export function useClaimTicketSearch({
  open,
  enabled,
  receivingId,
  lineId,
  initialQuery = null,
}: Params): UseClaimTicketSearch {
  return useTicketSearch({
    open,
    enabled,
    initialQuery,
    buildUrl: (query) =>
      receivingId
        ? `/api/receiving/zendesk-claim/link?${buildClaimTicketSearchParams({
            receivingId,
            lineId,
            query,
          })}`
        : null,
  });
}
