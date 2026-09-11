'use client';

/**
 * To-Ship desk shell — process column only (Center Lock).
 *
 * Order record editing mounts as {@link DeskStageOverlay} inside
 * {@link DashboardOrdersView}'s stage wrapper — not a right Details column.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

interface ToShipWmsShellProps {
  /** Middle column — tabs · KPI · triage · desk table / import / drill. */
  process: ReactNode;
  className?: string;
}

export function ToShipWmsShell({ process, className }: ToShipWmsShellProps) {
  return (
    <div className={cn('flex min-h-0 w-full flex-1', className)}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{process}</div>
    </div>
  );
}
