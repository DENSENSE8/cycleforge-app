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
      if (document.visibilityState === 'visible') void fetchEvents();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [fetchEvents]);

  const sheet = useInventoryEventsSpreadsheet({
    events: events ?? [],
    loading: events === null && fetching,
    emptyMessage: error ?? 'No inventory events yet.',
  });

  const refreshAction = useMemo(
    () => (
      <DeskHeaderAction
        variant="secondary"
        size="sm"
        icon={<RefreshCw />}
        loading={fetching}
        onClick={() => void fetchEvents()}
      >
        Refresh
      </DeskHeaderAction>
    ),
    [fetchEvents, fetching],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <DeskActionSlotRegistrar role="primary">{refreshAction}</DeskActionSlotRegistrar>
      <DataTable {...sheet} />
    </div>
  );
}
