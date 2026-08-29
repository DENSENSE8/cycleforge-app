'use client';

/**
 * Band-1 trailing CTAs for outbound desks (To-ship · Labels · Shipping · Pack).
 *
 * **Add removed 2026-08-29** (operator ruling): creation lives in the global
 * header's Add menu, on every route. What survives here is the desks' Import
 * popover — a channel sync is a desk-scoped verb about THIS queue, not a
 * create, so it does not belong in a global create menu.
 *
 * `layout="ingest"` therefore renders nothing but its `leading` escape: that
 * layout WAS the Add button. The ship desk reaches the ingest index
 * (manual · platform · file · sync · backfill) from the sheet toolbar's Import
 * instead — see `DashboardOrdersView`.
 */

import { WORKBENCH_CHROME_PILL_CLASS, WorkbenchChromeActionRow } from '@/components/dashboard/workbench-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { cn } from '@/utils/_cn';
import type { ReactNode } from 'react';

const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'h-full',
  'font-semibold uppercase tracking-widest',
);

export function OutboundOrderChromeActions({
  onNewOrder: _onNewOrder,
  layout = 'pair',
  leading,
}: {
  /** @deprecated Accepted and ignored — Add is the global header's. */
  onNewOrder: () => void;
  /** `ingest` = the ship desk, which now renders only `leading`. */
  layout?: 'pair' | 'ingest';
  /** Quiet desk control (Packed's filtered export). */
  leading?: ReactNode;
}) {
  if (layout === 'ingest') {
    // `leading` alone (Packed's filtered export). The Add this used to render
    // is the global header's now.
    return leading ? <WorkbenchChromeActionRow>{leading}</WorkbenchChromeActionRow> : null;
  }

  return (
    <WorkbenchChromeActionRow>
      <OrdersSyncPopover />
    </WorkbenchChromeActionRow>
  );
}
