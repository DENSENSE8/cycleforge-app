'use client';

/**
 * Admin › Inventory events explorer — the PAGE feed for `/admin/inventory/events`.
 *
 * The family is already registered (`inventory-events`). This file is the
 * mount: it spreads {@link useInventoryEventsSpreadsheet} onto DataTable.
 * Filters, pagination and SQL stay on the server page.
 */

import { DataTable } from '@/components/tables/DataTable';
import { useInventoryEventsSpreadsheet } from '@/components/inventory/events-grid/useInventoryEventsSpreadsheet';
import type { PulseEventRow } from '@/components/inventory/types';

export function EventsExplorerTable({
  events,
  emptyMessage,
}: {
  events: PulseEventRow[];
  emptyMessage: string;
}) {
  const sheet = useInventoryEventsSpreadsheet({
    events,
    emptyMessage,
    searchPlaceholder: 'Filter this page of events…',
  });
  return (
    <div className="flex h-[70vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} />
    </div>
  );
}
