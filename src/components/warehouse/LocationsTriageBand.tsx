'use client';

/**
 * Locations Band 3 — data-table triage (search + room refine).
 * UnboxTriageBand twin: h-10 flush row under KPI, above the sheet grid.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function LocationsTriageBand({
  search,
  right,
}: {
  search: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        // pl-0 — flush to the sheet edge (search icon lives inside the field).
        // No vertical pad — chrome search is a sunken plane edge-to-edge with
        // this row (not a floated pill).
        'flex h-10 min-w-0 shrink-0 items-stretch justify-between gap-2 border-r border-border-soft bg-surface-card pl-0 pr-0.5 shadow-sm',
      )}
    >
      <div className="flex min-w-0 shrink items-stretch">{search}</div>
      {right ? <div className="flex shrink-0 items-center gap-2 self-center">{right}</div> : null}
    </div>
  );
}
