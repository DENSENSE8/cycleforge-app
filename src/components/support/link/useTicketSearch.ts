import { useEffect, useState } from 'react';

/**
 * One candidate ticket from a link-candidates endpoint. Mirrors
 * `TicketLinkCandidate` (src/lib/zendesk-link-candidates.ts) — the server shape
 * every link surface consumes.
 */
export interface TicketCandidate {
  id: number;
  subject: string | null;
  /** First-comment snippet for the expanded detail view (server-capped). */
  description: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
  url: string | null;
  linkedToThis: boolean;
  /**
   * `reference` mode only — the entity this ticket is ANCHORED to, when that's
   * something else. Context, not a reason to hide it.
   */
  anchoredElsewhere?: { type: string; id: number } | null;
}

export interface UseTicketSearch {
  ticketQuery: string;
  setTicketQuery: (v: string) => void;
  ticketResults: TicketCandidate[];
  /** Count of matching tickets hidden because they're linked to other items. */
  hiddenLinked: number;
  searchLoading: boolean;
  /** Set when the link-candidates fetch fails (HTTP / !success / network). */
  searchError: string | null;
  selectedTicket: TicketCandidate | null;
  setSelectedTicket: React.Dispatch<React.SetStateAction<TicketCandidate | null>>;
  /** Clear the query/results — used when the host modal resets on open. */
  reset: () => void;
}

interface Params {
  open: boolean;
  /** Only search while the picker is actually visible. */
  enabled: boolean;
  /**
   * Build the candidates URL for the current query, or return null when the
   * anchor isn't resolvable yet (the hook then idles instead of fetching).
   *
   * This is the ONLY anchor-specific part of the search: the receiving claim
   * flow points it at /api/receiving/zendesk-claim/link, the shipment flow at
   * /api/support/tickets/link?anchorType=shipment&mode=reference. Everything else
   * — debounce, abort, error mapping, stale-selection drop — is identical, which
   * is why it lives here rather than being re-implemented per surface.
   */
  buildUrl: (query: string) => string | null;
}

/**
 * Link-mode ticket search. Fetches candidate tickets — the most recent ones when
 * the box is empty (the common case: the related ticket was just filed), or a
 * search/id lookup once the operator types. Debounced (300ms), aborts in flight.
 *
 * Owns the result set + the current selection so a selection that falls out of a
 * refreshed result set is dropped automatically.
 */
export function useTicketSearch({ open, enabled, buildUrl }: Params): UseTicketSearch {
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<TicketCandidate[]>([]);
  const [hiddenLinked, setHiddenLinked] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketCandidate | null>(null);

  // `buildUrl` is called inside the debounce rather than being an effect dep:
  // callers pass an inline closure, so depending on the function identity would
  // re-fire (and re-fetch) on every parent render. The URL it produces is
  // derived from props the caller already re-renders on.
  const url = enabled && open ? buildUrl(ticketQuery.trim()) : null;

  useEffect(() => {
    if (!open || !enabled || !url) return;
    const ctrl = new AbortController();
    const handle = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      fetch(url, { cache: 'no-store', signal: ctrl.signal })
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
          const tickets = Array.isArray(data.tickets) ? (data.tickets as TicketCandidate[]) : [];
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
  }, [open, enabled, url]);

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
