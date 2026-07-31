'use client';

/**
 * Shared Unbox browse skeletons — one anatomy for route loading and in-view
 * Suspense / dynamic() fallbacks so chrome → KPI → table cannot drift.
 *
 * Mirrors {@link UnboxWorkspaceView}: DashboardScrollShell, band chrome
 * (Queue · Viewed · History + search/staff/filter/Fields), OpsKpiBandSkeleton,
 * monitor table card with house row skeletons.
 */

import { SkeletonBase, SkeletonList } from '@/design-system/components/Skeletons';
import {
  MONITOR_SECTION_CARD_SCROLL_CLASS,
  OpsKpiBandSkeleton,
} from '@/design-system/components/monitor';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

const TABLE_ROW_COUNT = 8;

/** Monitor table-card shell + house row skeletons (chunk / Suspense fallback). */
export function UnboxTableCardSkeleton() {
  return (
    <div
      className={cn(
        MONITOR_SECTION_CARD_SCROLL_CLASS,
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      )}
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
          <div className={WORKBENCH_CHROME_COLUMN}>
            <div className="flex h-10 items-stretch gap-2 rounded-2xl border border-border-soft bg-surface-card p-0.5 shadow-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
                <SkeletonBase width="64px" height="24px" className="rounded-full" />
              </div>
              <div className="ml-auto flex items-center gap-2 pr-0.5">
                {/* search · staff · filter · Fields — History/Queue trailing cluster */}
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
                <SkeletonBase width="28px" height="28px" className="rounded-lg" />
              </div>
            </div>
          </div>
        }
      >
        <div className={WORKBENCH_BODY_COLUMN}>
          <div className="mb-4">
            <OpsKpiBandSkeleton count={3} loadingLabel="Loading unbox metrics…" />
          </div>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <UnboxTableCardSkeleton />
          </div>
        </div>
      </DashboardScrollShell>
    </div>
  );
}
