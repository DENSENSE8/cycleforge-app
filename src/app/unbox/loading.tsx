'use client';

/**
 * Route-level loading shell for `/unbox` — paints the Unbox workbench's real
 * anatomy (chrome band → KPI strip → table card with row skeletons) the moment
 * navigation starts, so the operator never stares at a blank page slot while
 * the route chunk / RSC payload streams. Geometry mirrors UnboxWorkspaceView:
 * DashboardScrollShell columns + monitor card shell + house SkeletonList rows.
 */

import { SkeletonBase, SkeletonList } from '@/design-system/components/Skeletons';
import {
  MONITOR_KPI_TILE_CLASS,
  MONITOR_SECTION_CARD_SCROLL_CLASS,
} from '@/design-system/components/monitor';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { appWashClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export default function UnboxLoading() {
  return (
    <div
      className={cn('flex h-full w-full flex-col overflow-hidden', appWashClass)}
      aria-busy="true"
      aria-label="Loading Unbox"
    >
      {/* Chrome band — 40px band-density face (mirrors UnboxWorkspaceHeader). */}
      <div className={WORKBENCH_CHROME_COLUMN}>
        <div className="flex h-10 items-center justify-between gap-2 rounded-2xl border border-border-soft bg-surface-card p-0 shadow-sm">
          <div className="flex items-center gap-1.5">
            <SkeletonBase width="64px" height="24px" className="rounded-full" />
            <SkeletonBase width="64px" height="24px" className="rounded-full" />
            <SkeletonBase width="64px" height="24px" className="rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBase width="28px" height="28px" className="rounded-lg" />
            <SkeletonBase width="28px" height="28px" className="rounded-lg" />
          </div>
        </div>
      </div>

      <div className={cn(WORKBENCH_BODY_COLUMN, 'min-h-0 flex-1')}>
        {/* KPI strip — three tile placeholders (mirrors StripSkeleton). */}
        <div className="mb-4 flex flex-wrap gap-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={cn(MONITOR_KPI_TILE_CLASS, 'h-24 min-w-0 grow basis-40')}
            >
              <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
              <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
              <div className="mt-2.5 h-2.5 w-20 rounded-full bg-surface-strong" />
            </div>
          ))}
        </div>

        {/* Table card — house row skeletons inside the monitor card shell. */}
        <div
          className={cn(
            MONITOR_SECTION_CARD_SCROLL_CLASS,
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          )}
        >
          <div className="p-3">
            <SkeletonList count={10} type="row" />
          </div>
        </div>
      </div>
    </div>
  );
}
