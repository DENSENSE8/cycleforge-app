import { useEffect, useRef, useState } from 'react';

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
  /**
   * Host seed applied for this enable cycle (trimmed), or '' when none.
   * Claim Link uses this to paint "Suggested from tracking" when the box still
   * equals the carton tracking.
   */
  seededQuery: string;
}

interface Params {
  open: boolean;
  /** Only search while the picker is actually visible. */
  enabled: boolean;
  /**
   * Seed the box when link mode becomes active (e.g. carton tracking). Applied
   * once per enable cycle; operator edits win until the next New→Link / reopen.
   */
  initialQuery?: string | null;
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
  /**
   * The fetch used for the candidates call. Defaults to the global — a staff
   * surface rides its session cookie and needs nothing else.
   *
   * The KIOSK does: a device principal's `cf_kiosk` cookie can be stale after
   * another surface re-bound the row, and production has no server-side
   * re-bind, so every device-authed client call goes through
   * `kioskFetchHealed` (`src/lib/kiosk/kiosk-self-heal.ts`). That is a
   * TRANSPORT difference, not a second search: the debounce, the abort, the
   * error mapping and the stale-selection drop below are the same rules, which
   * is why this is one injected function rather than a forked hook.
   */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * Link-mode ticket search. Fetches candidate tickets — the most recent ones when
 * the box is empty (the common case: the related ticket was just filed), or a
 * search/id lookup once the operator types / a host seed lands. Debounced
 * (300ms), aborts in flight.
 *
 * Owns the result set + the current selection so a selection that falls out of a
 * refreshed result set is dropped automatically.
 */
export function useTicketSearch({
  open,
  enabled,
  buildUrl,
  initialQuery = null,
  fetcher,
}: Params): UseTicketSearch {
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<TicketCandidate[]>([]);
  const [hiddenLinked, setHiddenLinked] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketCandidate | null>(null);
  const [seededQuery, setSeededQuery] = useState('');
  const seededForEnableRef = useRef(false);

  // Apply / clear host seed when the picker opens into link mode (or New→Link).
  useEffect(() => {
    if (!open) {
      setTicketQuery('');
      setTicketResults([]);
      setHiddenLinked(0);
      setSelectedTicket(null);
      setSearchError(null);
      setSeededQuery('');
      seededForEnableRef.current = false;
      return;
    }
    if (!enabled) {
      seededForEnableRef.current = false;
      return;
    }
    if (seededForEnableRef.current) return;
    seededForEnableRef.current = true;
    const seed = (initialQuery ?? '').trim();
    setSeededQuery(seed);
    setTicketQuery(seed);
    setSelectedTicket(null);
    setTicketResults([]);
    setHiddenLinked(0);
    setSearchError(null);
  }, [open, enabled, initialQuery]);

  // `buildUrl` is called inside the debounce rather than being an effect dep:
  // callers pass an inline closure, so depending on the function identity would
  // re-fire (and re-fetch) on every parent render. The URL it produces is
  // derived from props the caller already re-renders on.
  const url = enabled && open ? buildUrl(ticketQuery.trim()) : null;

  /*
   * Held in a ref for the same reason `buildUrl` is not an effect dep: callers
   * pass an inline closure, so its identity changes every parent render and
   * naming it as a dep would re-fire the fetch on each one. The transport is
   * not part of what "the search changed" means.
   */
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!open || !enabled || !url) return;
    const ctrl = new AbortController();
    const handle = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      // Detached `fetch` is called as a plain function on purpose — the
      // fallback is the global, never `window.fetch` off a receiver.
      const send = fetcherRef.current ?? ((u: string, init: RequestInit) => fetch(u, init));
      send(url, { cache: 'no-store', signal: ctrl.signal })
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
    const seed = open && enabled ? (initialQuery ?? '').trim() : '';
    setTicketQuery(seed);
    setSeededQuery(seed);
    setTicketResults([]);
    setHiddenLinked(0);
    setSelectedTicket(null);
    setSearchError(null);
    setSearchLoading(true);
    // Keep the enable cycle when still open+enabled (StnTicketLinkModal calls
    // reset on open to drop a stale selection — must not fight the seed effect).
    seededForEnableRef.current = Boolean(open && enabled);
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
    seededQuery,
  };
}
