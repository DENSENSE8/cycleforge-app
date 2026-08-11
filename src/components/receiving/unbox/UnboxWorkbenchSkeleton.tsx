'use client';

/**
 * Shared Unbox browse skeletons — one anatomy for route loading and in-view
 * Suspense fallbacks so chrome → table cannot drift.
 *
 * Mirrors {@link UnboxWorkspaceView}: DashboardScrollShell, three-row pinned
 * chrome (row 1: tabs · CTA; KPI row; row 2: search · refine), flush sheet
 * host with house row skeletons. KPI is chrome-pinned, not a body block.
 *
 * Ops chrome flush: zero soft radius / decorative shadow — column is the card.
 * SkeletonBase defaults to rounded-md; override with rounded-none everywhere.
 */

import { SkeletonBase, SkeletonList } from '@/design-system/components/Skeletons';
import { MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const TABLE_ROW_COUNT = 8;
/** Force flush over SkeletonBase's default `rounded-md` (no twMerge there). */
const FLUSH_BAR = cn(cornerClass('flush'), '!rounded-none');

/** Flush sheet skeleton + house row skeletons (Suspense fallback). */
export function UnboxTableCardSkeleton() {
  return (
    <div
      className={cn(WORKBENCH_SHEET_HOST, 'overflow-hidden bg-surface-card')}
      aria-busy="true"
    >
      <SkeletonList count={TABLE_ROW_COUNT} type="row" />
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
                'flex items-stretch gap-0 [&>*+*]:-ml-px border-b border-r border-border-soft bg-surface-card p-0',
                PRIMARY_CHROME_ROW_FACE,
              )}
            >
              <div className="flex min-w-0 items-center gap-0">
                <SkeletonBase width="64px" height="24px" className={FLUSH_BAR} />
                <SkeletonBase width="64px" height="24px" className={FLUSH_BAR} />
                <SkeletonBase width="64px" height="24px" className={FLUSH_BAR} />
              </div>
              <div className="min-w-0 flex-1" />
              <div className="flex items-center gap-0 pr-0.5">
                <SkeletonBase width="88px" height="28px" className={FLUSH_BAR} />
                <SkeletonBase width="72px" height="28px" className={FLUSH_BAR} />
              </div>
            </div>
            {/* KPI row */}
            <div
              className="flex flex-wrap gap-0 border-r border-b border-border-soft bg-surface-card p-0"
              aria-hidden
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    MONITOR_KPI_TILE_CLASS,
                    cornerClass('flush'),
                    'h-20 min-w-0 grow basis-40 border-r border-border-soft last:border-r-0',
                  )}
                >
                  <div className="flex items-start justify-between gap-3 px-3 pt-2">
                    <SkeletonBase width="64px" height="10px" className={FLUSH_BAR} />
                    <SkeletonBase width="32px" height="10px" className={FLUSH_BAR} />
                  </div>
                  <SkeletonBase
                    width="56px"
                    height="28px"
                    className={cn(FLUSH_BAR, 'mt-2 ml-3')}
                  />
                </div>
              ))}
            </div>
            {/* Row 2 — search · refine */}
            <div
              className={cn(
                'flex items-center justify-between gap-0 border-b border-r border-border-soft bg-surface-card p-0.5',
                PRIMARY_CHROME_ROW_FACE,
              )}
            >
              <SkeletonBase width="120px" height="28px" className={FLUSH_BAR} />
              <div className="flex items-center gap-0">
                <SkeletonBase width="28px" height="28px" className={FLUSH_BAR} />
                <SkeletonBase width="28px" height="28px" className={FLUSH_BAR} />
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
