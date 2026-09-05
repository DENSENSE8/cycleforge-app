'use client';

/**
 * `OrdersGridHost` — mount the outbound orders table for ONE lane.
 *
 * ```tsx
 * <OrdersGridHost ariaLabel="Shipped orders" records={rows} search={…} … />
 * ```
 *
 * This is not a second table. `useOrdersSpreadsheet` resolves the FEED half of
 * a {@link DataTable} mount; this host adds the two things that are properties
 * of "an outbound lane is on screen" rather than of any one lane, and which
 * kept being forgotten when each lane spread the bag itself:
 *
 *  1. the lane **total**, so the status bar reads "200 of 922" and not
 *     "200 of 200", which would quietly claim the queue was fully loaded;
 *  2. the **copy shape**, so selecting rows and copying works on every lane
 *     rather than on one.
 *
 * The chrome half — search, filter, tabs — stays with the lane, because the
 * lane is the only thing that knows which URL those controls write to.
 */

import { useMemo } from 'react';
import {
  DataTable,
  type DataTableFilterOption,
  type DataTableSearch,
} from '@/components/tables/DataTable';
import {
  useOrdersSpreadsheet,
  type UseOrdersSpreadsheetOptions,
} from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
import type { DataTableTab } from '@/components/tables/TableStatusBar';
import type { DataTableDateMenu } from '@/components/tables/DataTable';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export interface OrdersGridHostProps extends UseOrdersSpreadsheetOptions {
  /** The one find field, as data. */
  search: DataTableSearch;
  /** Quick date refinement, drawn beside the filter. Omit where period is meaningless. */
  dateMenu?: DataTableDateMenu;
  /** Filename for the toolbar's CSV export. */
  exportFilename?: string;
  /** The one filter control, as data. Omit on a lane with nothing to refine. */
  filter?: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };
  tabs?: readonly DataTableTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Server-side total for the lane, when the lane knows one.
   *
   * Omitted, the status bar reports the rendered row count — honest for a lane
   * that has everything it will ever show. To-ship and Shipped page their
   * feeds, so they pass the real total.
   */
  totalCount?: number;
}

export function OrdersGridHost({
  totalCount,
  search,
  filter,
  dateMenu,
  exportFilename,
  tabs,
  activeTab,
  onTabChange,
  ...options
}: OrdersGridHostProps) {
  const sheet = useOrdersSpreadsheet(options);

  // The shipped ORDER-export shape, not the on-screen column set: a pasted row
  // has to carry the identity fields (record id, SKU, platform) that make it
  // useful away from the app, and half the visible tracks are chips and icons
  // with no text to copy.
  const copyExport = useMemo(
    () => ({
      columns: [...ORDER_EXPORT_COLUMNS],
      toRow: (row: ShippedOrder) => buildOrderExportRow(row),
    }),
    [],
  );

  return (
    <OrderStatusTrailStage>
      <DataTable
        {...sheet}
        search={search}
        filter={filter}
        dateMenu={dateMenu}
        exportFilename={exportFilename}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        totalCount={totalCount}
        copyExport={copyExport}
      />
    </OrderStatusTrailStage>
  );
}
