'use client';

/**
 * To-Ship WMS desk shell — 3-column scaffold: Recents · Process · Details.
 *
 * Intentionally introduces an in-desk left rail for order recents while the
 * frame stays Pattern E (no ContextPanelLayout occupant for `/shipping/orders`).
 * Middle column hosts the workbench chrome + desk-forked LedgerGrid; right
 * column stays {@link DashboardOrderDetails} / {@link ShippedDetailsPanel}.
 */

import type { ReactNode } from 'react';
import { ToShipRecentRail } from './ToShipRecentRail';
import { cn } from '@/utils/_cn';

const TO_SHIP_WMS_LEFT_RAIL_PX = 280;

interface ToShipWmsShellProps {
  /** Middle column — tabs · KPI · triage · desk table / import / drill. */
  process: ReactNode;
  /** Right column — order inspector (null when support focus replaces it). */
  details: ReactNode | null;
  className?: string;
}

export function ToShipWmsShell({ process, details, className }: ToShipWmsShellProps) {
  return (
    <div className={cn('flex min-h-0 w-full flex-1', className)}>
      <aside
        className="flex shrink-0 flex-col border-r border-border-hairline bg-surface-sunken"
        style={{ width: TO_SHIP_WMS_LEFT_RAIL_PX }}
        aria-label="Recent orders"
      >
        <ToShipRecentRail />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{process}</div>

      {details}
    </div>
  );
}
