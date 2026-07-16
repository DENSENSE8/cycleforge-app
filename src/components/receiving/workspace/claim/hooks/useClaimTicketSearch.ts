import { useEffect, useState } from 'react';
import type { LinkCandidate } from '../claim-types';

export interface UseClaimTicketSearch {
  ticketQuery: string;
  setTicketQuery: (v: string) => void;
  ticketResults: LinkCandidate[];
  /** Count of matching tickets hidden because they are linked to other items. */
  hiddenLinked: number;
  searchLoading: boolean;
  /** Set when the link-candidates fetch fails (HTTP / !success / network). */
  searchError: string | null;
  selectedTicket: LinkCandidate | null;
  setSelectedTicket: React.Dispatch<React.SetStateAction<LinkCandidate | null>>;
  /** Clear the query/results — used when the modal resets on open. */
  reset: () => void;
}

interface Params {
  open: boolean;
  /** Only search while the link tab is active. */
  enabled: boolean;
  receivingId: number | null | undefined;
  lineId: number | null | undefined;
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

/**
 * Link-mode ticket search. Fetches candidate tickets — the most recent ones
 * when the box is empty (the common case: the related ticket was just filed),
 * or a Zendesk search/id lookup once the operator types. The endpoint hides
 * tickets already linked to a different item and flags ones linked to THIS
 * item, so everything returned is safe to pick. Debounced (300ms).
 *
 * Owns the result set + the current selection so a selection that falls out of
 * a refreshed result set is dropped automatically.
 */
export function useClaimTicketSearch({ open, enabled, receivingId, lineId }: Params): UseClaimTicketSearch {
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<LinkCandidate[]>([]);
  const [hiddenLinked, setHiddenLinked] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<LinkCandidate | null>(null);

  useEffect(() => {
    if (!open || !enabled || !receivingId) return;
    const query = ticketQuery.trim();
    const ctrl = new AbortController();
    const handle = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      const params = buildClaimTicketSearchParams({ receivingId, lineId, query });
      fetch(`/api/receiving/zendesk-claim/link?${params}`, {
        cache: 'no-store',
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          if (!r.ok || !data?.success) {
            const message =
              (typeof data?.error === 'string' && data.error.trim()) ||
              (typeof data?.details === 'string' && data.details.trim()) ||
              `Couldn't load tickets (HTTP ${r.status})`;
            setSearchError(message);
            setTicketResults([]);
            setHiddenLinked(0);
            return;
          }
          setSearchError(null);
          const tickets = Array.isArray(data.tickets) ? (data.tickets as LinkCandidate[]) : [];
          setTicketResults(tickets);
          setHiddenLinked(Number(data.hiddenLinked) || 0);
          // Drop a selection that fell out of the new result set.
          setSelectedTicket((prev) =>
            prev && tickets.some((t) => t.id === prev.id) ? prev : null,
          );
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setSearchError("Couldn't load tickets — helpdesk may not be connected.");
          setTicketResults([]);
          setHiddenLinked(0);
        })
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(handle);
    };
  }, [open, enabled, receivingId, lineId, ticketQuery]);

  const reset = () => {
    setTicketQuery('');
    setTicketResults([]);
    setHiddenLinked(0);
    setSelectedTicket(null);
    setSearchError(null);
    setSearchLoading(true);
  };

  return {
    ticketQuery,
    setTicketQuery,
    ticketResults,
    hiddenLinked,
    searchLoading,
    searchError,
    selectedTicket,
    setSelectedTicket,
    reset,
  };
}
