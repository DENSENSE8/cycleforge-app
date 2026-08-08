'use client';

/**
 * Shared Unbox browse skeletons — one anatomy for route loading and in-view
 * Suspense / dynamic() fallbacks so chrome → table cannot drift.
 *
 * Mirrors {@link UnboxWorkspaceView}: DashboardScrollShell, three-row pinned
 * chrome (row 1: tabs · CTA; KPI row: big clickable-filter tiles, its own
 * row; row 2: search · refine filters — the data-table triage band), flush
 * sheet host with house row skeletons. KPI is chrome-pinned, not a body
 * block.
 */

import { SkeletonBase, SkeletonList } from '@/design-system/components/Skeletons';
import { MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

const TABLE_ROW_COUNT = 8;

/** Flush sheet skeleton + house row skeletons (chunk / Suspense fallback). */
export function UnboxTableCardSkeleton() {
  return (
    <div
      className={cn(WORKBENCH_SHEET_HOST, 'overflow-hidden bg-surface-card')}
      aria-busy="true"
    >
      <div className="p-3">
        <SkeletonList count={TABLE_ROW_COUNT} type="row" />
      </div>
    </div>
  );
}

/** Full browse workbench skeleton — route `/unbox` loading shell. */
export function UnboxWorkbenchSkeleton() {
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col"
      aria-busy="true"
      aria-label="Loading Unbox"
    >
      <DashboardScrollShell
        className="h-full bg-transparent"
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            {/* Row 1 — tabs · CTA — flush to context rail */}
            <div
              className={cn(
                'flex items-stretch gap-0 border-b border-r border-border-soft bg-surface-card p-0 shadow-sm',
                PRIMARY_CHROME_ROW_FACE,
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
              </div>
              <div className="min-w-0 flex-1" />
              <div className="flex items-center gap-2 pr-0.5">
                <SkeletonBase width="88px" height="28px" className="rounded-lg" />
                <SkeletonBase width="72px" height="28px" className="rounded-lg" />
              </div>
            </div>
            {/* KPI row */}
            <div className="flex flex-wrap gap-3 border-r border-b border-border-soft bg-surface-card px-3 py-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className={cn(MONITOR_KPI_TILE_CLASS, 'h-20 min-w-0 grow basis-40')}>
                  <div className="flex items-start justify-between gap-3">
                    <SkeletonBase width="64px" height="10px" className="rounded-full" />
                    <SkeletonBase width="32px" height="10px" className="rounded-full" />
                  </div>
                  <SkeletonBase width="56px" height="28px" className="mt-2 rounded" />
                </div>
              ))}
            </div>
            {/* Row 2 — search · refine */}
            <div
              className={cn(
                'flex items-center justify-between gap-2 border-b border-r border-border-soft bg-surface-card p-0.5 shadow-sm',
                PRIMARY_CHROME_ROW_FACE,
              )}
            >
              <SkeletonBase width="120px" height="28px" className="rounded-lg" />
              <div className="flex items-center gap-2">
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
              </div>
            </div>
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
          <UnboxTableCardSkeleton />
        </div>
      </DashboardScrollShell>
    </div>
  );
}
