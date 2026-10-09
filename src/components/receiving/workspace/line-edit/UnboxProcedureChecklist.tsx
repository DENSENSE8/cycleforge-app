'use client';

/** The Unbox checklist — the live "where am I" display, on the right edge. */

import { ProcedureChecklist } from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

type UnboxProcedureChecklistProps = {
  row: ReceivingLineRow;
  /**
   * Cap visible rows (scroll for the rest). Omit for the scan-progress hover
   * peek — that surface shows the full checklist at natural height.
   */
  maxVisibleRows?: number;
};

/** Placeholder at the real geometry while the photo counts hydrate. */
function ProcedureSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col divide-y divide-border-hairline" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="inset-cozy flex items-center gap-2">
          <SkeletonBase circle width="1rem" height="1rem" className="shrink-0" />
          <SkeletonBase width="55%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}

export function UnboxProcedureChecklist({
  row,
  maxVisibleRows,
}: UnboxProcedureChecklistProps) {
  const {
    steps,
    settled,
    stepCount,
    activeKey,
    focusStep,
    flowLabel,
    reorderCaptureSteps,
  } = useUnboxProcedureSteps(row);

  const doneCount = steps.reduce((n, step) => n + (step.state === 'done' ? 1 : 0), 0);
  const allDone = steps.length > 0 && doneCount === steps.length;
  const skeletonRows =
    maxVisibleRows != null ? Math.min(stepCount, maxVisibleRows) : stepCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-role-eyebrow text-text-soft">
          {flowLabel}
        </p>
        {settled && steps.length > 0 ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-role-micro tabular-nums ${
              allDone ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-sunken text-text-soft'
            }`}
          >
            {doneCount}/{steps.length}
          </span>
        ) : null}
      </div>

      {/* Gate on settled evidence: un-hydrated zeros read as "nothing shot",
          which would mark the wrong step active for a beat and then jump. */}
      {settled ? (
        // Clicking a row moves the CENTRE's pointer to that step — the checklist is the map, the cards are the work, and the map is how you navigate.
        <ProcedureChecklist
          steps={steps}
          activeKey={activeKey}
          onSelectStep={focusStep}
          onReorderSteps={reorderCaptureSteps}
          maxVisibleRows={maxVisibleRows}
        />
      ) : (
        <ProcedureSkeleton rows={skeletonRows} />
      )}
    </div>
  );
}
