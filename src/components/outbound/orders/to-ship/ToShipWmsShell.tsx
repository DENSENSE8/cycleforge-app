'use client';

/**
 * To-Ship desk shell — Process · Details.
 *
 * Frame is Pattern E (no ContextPanelLayout occupant for `/shipping/orders`).
 * Middle column hosts the workbench chrome + desk-forked LedgerGrid; right
 * column stays {@link DashboardOrderDetails} / {@link ShippedDetailsPanel}.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{process}</div>
      {details}
    </div>
  );
}
