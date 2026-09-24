'use client';

/**
 * Inventory › Ledger activity — the last 50 inventory events, on the ONE table.
 *
 * This was a hand-rolled `<ul>` of `EventRow` cards: fixed spans, no header, no
 * sort, no Fields picker, no org binding — a second table display. Every fact
 * the card painted is a bound field in `INVENTORY_EVENTS_FIELD_CATALOG`. This
 * file is the FEED; the display is {@link useInventoryEventsSpreadsheet} →
 * DataTable. `PulseWorkspace` points the same family at a different feed.
 *
 * Refresh is the desk header CTA (`DeskHeaderAction`), same altitude as every
 * other page verb — not a second title row under Inventory.
 *
 * ## The find text is part of the FETCH, not a pass over what arrived
 *
 * 50 rows is a window onto a ledger with hundreds of thousands of events, so a
 * browser-side filter answered "no match" for anything older than about an
 * hour, and it narrowed even the rows it had to the facts the mounted tracks
 * paint. `?q=` is answered in SQL across the joined catalog title, serial, bin
 * names and actor; a searching read also drops the 50-row page bound, because
 * a bounded search is the same lie one layer down.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { DataTable } from '@/components/tables/DataTable';
import { useInventoryEventsSpreadsheet } from './events-grid/useInventoryEventsSpreadsheet';
import type { PulseEventRow, PulseEventsResponse } from './types';

const PULSE_LIMIT = 50;
const REFRESH_INTERVAL_MS = 30_000;

export function PulseView() {
  const [events, setEvents] = useState<PulseEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const [query, setQuery] = useState('');

  const fetchEvents = useCallback(async (find: string) => {
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const q = find.trim();
      // The route opens to its ceiling when `q` is present, so a `limit` under
      // a search would only be ignored.
      if (q) params.set('q', q);
      else params.set('limit', String(PULSE_LIMIT));
      const res = await fetch(`/api/inventory-events?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(message);
      }
      const data: PulseEventsResponse = await res.json();
      setEvents(data.events);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load events';
      setError(message);
    } finally {
      setFetching(false);
    }
  }, []);

  // `query` is a FETCH KEY here. `SearchField` already debounces at 320ms, so
  // this re-reads once per settled keystroke and adds no second timer.
  useEffect(() => {
    void fetchEvents(query);
    const handle = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchEvents(query);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [fetchEvents, query]);

  const search = useMemo(
    () => ({
      value: query,
      onChange: setQuery,
      placeholder: 'Filter activity…',
      answeredBy: 'server' as const,
      pending: fetching,
    }),
    [query, fetching],
  );

  const sheet = useInventoryEventsSpreadsheet({
    events: events ?? [],
    loading: events === null && fetching,
    emptyMessage: error ?? 'No inventory events yet.',
    search,
  });

  const refreshAction = useMemo(
    () => (
      <DeskHeaderAction
        variant="secondary"
        size="sm"
        icon={<RefreshCw />}
        loading={fetching}
        onClick={() => void fetchEvents(query)}
      >
        Refresh
      </DeskHeaderAction>
    ),
    [fetchEvents, fetching, query],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <DeskActionSlotRegistrar role="primary">{refreshAction}</DeskActionSlotRegistrar>
      <DataTable {...sheet} />
    </div>
  );
}
