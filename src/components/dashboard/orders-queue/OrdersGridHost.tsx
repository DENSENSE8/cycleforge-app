'use client';

/**
 * `OrdersGridHost` — mount the outbound orders spreadsheet for ONE lane.
 *
 * ```tsx
 * <OrdersGridHost ariaLabel="Shipped orders" records={rows} … />
 * ```
 *
 * This is not a second table. `useOrdersSpreadsheet` already resolves the whole
 * `NonlinearTableHost` prop bag; the three lines that spread it onto the host
 * were being re-typed at every lane, and with them two things that must not be
 * per-lane and kept being forgotten:
 *
 *  1. the Sheets **status counts** — so "200 of 922 · 12 selected" is right on
 *     Packed and Shipped, not only on To-ship;
 *  2. the Sheets **data source** — so Copy, Export and Print act on the lane's
 *     filtered rows rather than being absent on every lane but one.
 *
 * Both are properties of "an outbound lane is on screen", so they belong to the
 * one component that means exactly that. A lane that needs a richer count than
 * the row length (To-ship knows its server-side lane total) reports its own and
 * this host's numbers are merged under it.
 *
 * Restored 2026-08-29 as part of Phase 4a (`docs/todo/one-sheet-table-sot-PLAN.md`);
 * the pre-teardown component of this name mounted the same hook.
 */

import { useMemo } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import {
  useOrdersSpreadsheet,
  type UseOrdersSpreadsheetOptions,
} from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import type { DataTableSearch } from '@/components/tables/DataTable';
import type { DataTableTabStrip } from '@/components/tables/TableStatusBar';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export interface OrdersGridHostProps extends UseOrdersSpreadsheetOptions {
  /**
   * Server-side total for the lane, when the lane knows one.
   *
   * Omitted, the status bar reports `records.length` — honest for a lane that
   * has everything it will ever show. To-ship and Shipped page their feeds, so
   * they pass the real total and the bar reads "200 of 922" instead of
   * "200 of 200", which would quietly claim the queue was fully loaded.
   */
  totalCount?: number;
  /** The find field, as data — the lane above owns the URL it writes. */
  search: DataTableSearch;
  /** The desk's mode strip, when this lane is one body among several. */
  tabStrip?: DataTableTabStrip;
}

export function OrdersGridHost({
  totalCount,
  search,
  tabStrip,
  ...options
}: OrdersGridHostProps) {
  const sheet = useOrdersSpreadsheet(options);
  // Copy acts on the SELECTION, and it copies the shipped ORDER-export shape
  // rather than the on-screen column set: a pasted row has to carry the
  // identity fields (record id, SKU, platform) that make it useful away from
  // the app, and half the visible tracks are chips and icons with no text.
  const copyExport = useMemo(
    () => ({
      columns: [...ORDER_EXPORT_COLUMNS],
      toRow: (row: ShippedOrder) => buildOrderExportRow(row),
    }),
    [],
  );

  return (
    <DataTable
      {...sheet}
      search={search}
      {...tabStrip}
      totalCount={totalCount}
      copyExport={copyExport}
    />
  );
}
