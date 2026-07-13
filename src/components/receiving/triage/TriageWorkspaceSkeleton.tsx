'use client';

/**
 * Right-pane skeleton loader for the **Triage** surface — triage's own skeleton,
 * never the unbox display. Mirrors {@link TriagePanel}'s toolbar + centered
 * `max-w-3xl` card column (carton context → package pairing → notes) with
 * design-system {@link SkeletonBase} primitives, so the handoff to the loaded
 * TriagePanel is continuous. Shown while a triage tracking scan is in flight
 * (surface-tagged; see ReceivingRightPane / useReceivingWorkspacePane).
 *
 * Sibling to the unbox {@link ReceivingWorkspaceSkeleton}. There is no
 * "Finding your PO"-style hero — the skeleton IS the loading affordance.
 */

import { SkeletonBase } from '@/design-system';

/** One triage skeleton card = a title bar + N pulsing rows. */
function TriageSkeletonCard({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface-card px-5 py-4 shadow-sm">
      <SkeletonBase width="120px" height="10px" className="mb-3 rounded-full" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBase key={i} width={`${100 - i * 12}%`} height="12px" className="rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function TriageWorkspaceSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col bg-surface-canvas" aria-busy="true" aria-label="Loading carton">
      {showHeader ? (
        <div className="flex h-10 shrink-0 items-center border-b border-border-hairline bg-surface-card">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 sm:px-6">
            <SkeletonBase width="120px" height="24px" className="rounded-full" />
            <div className="flex items-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBase key={i} circle width="32px" height="32px" />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-5 pb-32 sm:px-6">
          <TriageSkeletonCard rows={3} />
          <TriageSkeletonCard rows={2} />
          <TriageSkeletonCard rows={2} />
        </div>
      </div>
    </div>
  );
}
