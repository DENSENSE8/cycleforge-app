'use client';

/**
 * Inventory › Ledger activity — the last 50 inventory events, on the ONE table.
 *
 * This was a hand-rolled `<ul>` of `EventRow` cards: fixed spans, no header, no
 * sort, no Fields picker, no org binding — a second table display in a codebase
 * whose table SoT is the slot engine
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md`). The port restyled nothing:
 * every fact the card painted is a bound field in
 * `INVENTORY_EVENTS_FIELD_CATALOG`, and the faces (relative age with the
 * instant on its tooltip, the mono event tag, the status transition chips, the
 * copyable SKU / serial) moved to the family's cell map.
 *
 * What the ledger GAINED by giving up its fork: click-to-sort on every painted
 * data header, search, the Fields picker, per-org slot bindings, the shared
 * empty / loading states, and the same row chrome as every other desk sheet.
 *
 * This file is now the FEED and nothing else — the display is the shared
 * engine, reached through {@link useInventoryEventsSpreadsheet}, which
 * `PulseWorkspace` points at a different feed. That is the seam: one table,
 * many backends.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { DataTable } from '@/components/tables/DataTable';
import { useInventoryEventsSpreadsheet } from './events-grid/useInventoryEventsSpreadsheet';
import type { PulseEventRow, PulseEventsResponse } from './types';

const PULSE_LIMIT = 50;
const REFRESH_INTERVAL_MS = 30_000;

export function PulseView() {
  const [events, setEvents] = useState<PulseEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const fetchEvents = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory-events?limit=${PULSE_LIMIT}`, {
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
      lastFetchRef.current = Date.now();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load events';
      setError(message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const handle = window.setInterval(() => {
      // Only refetch when the document is visible — avoids burning Neon CU when
      // an operator's laptop is locked.
      if (document.visibilityState === 'visible') void fetchEvents();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [fetchEvents]);

  const sheet = useInventoryEventsSpreadsheet({
    events: events ?? [],
    loading: events === null && fetching,
    emptyMessage: error ?? 'No inventory events yet.',
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 py-2 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Recent activity</h2>
          <p className="text-xs text-text-soft">
            Last {events?.length ?? 0} inventory events · auto-refresh 30s
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw />}
          loading={fetching}
          onClick={() => void fetchEvents()}
        >
          Refresh
        </Button>
      </header>

      <DataTable {...sheet} />
    </div>
  );
}
