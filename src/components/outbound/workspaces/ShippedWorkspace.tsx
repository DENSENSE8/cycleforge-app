'use client';

/**
 * Shipped desk body — the shipment archive, mounted under the shared desk
 * chrome at `/shipping/shipped`.
 *
 * ## What moved, and what deliberately did not
 *
 * The table is the EXISTING {@link DashboardShippedTable} — the packer-log week
 * sheet — remounted, not rewritten. Its feed, filters, grouping and empty state
 * were never the thing being changed; what changed is that history now has a
 * door of its own instead of being a lifecycle tab on the open queue. The param
 * resolver (`resolveShippedQueryArgs`) and the saved-view storage key
 * (`shipped_saved_views`) are untouched, which is what lets an old
 * `?shipped=&carrier=UPS` bookmark redirect here and read identically.
 *
 * ## Packed history lives here too
 *
 * This component IS the packer-log sheet, so "Packed history" needs no second
 * home: `?ostatus=PACKED_STAGED` narrows it to the staged lane through the
 * existing outbound-state facet. `/shipping/orders?packed=` stays what it is —
 * a STAGE facet on open work (packed but not yet handed to a carrier is still
 * work in the warehouse), not an archive.
 *
 * ## Details
 *
 * Row click opens the shared order panel through the same
 * {@link useDashboardSelectedOrder} + {@link DashboardOrderDetails} pair the
 * To-ship desk uses, so there is one details SoT and `?openOrderId=` deep-links
 * on both desks.
 */

import { useCallback } from 'react';
import { DashboardShippedTable } from '@/components/shipped/DashboardShippedTable';
import { DashboardOrderDetails } from '@/components/dashboard/DashboardOrderDetails';
import { useDashboardSelectedOrder } from '@/hooks/useDashboardSelectedOrder';
import { refreshDomain } from '@/lib/refresh/bus';

export function ShippedWorkspace() {
  const { selectedShipped, selectedContext, requestCloseSelectedOrder } =
    useDashboardSelectedOrder(true);

  const refreshShipped = useCallback(() => {
    refreshDomain('orders.outbound');
  }, []);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <DashboardShippedTable />
      <DashboardOrderDetails
        detailsEnabled
        selectedShipped={selectedShipped}
        selectedContext={selectedContext}
        onClose={requestCloseSelectedOrder}
        onUpdate={refreshShipped}
      />
    </div>
  );
}
