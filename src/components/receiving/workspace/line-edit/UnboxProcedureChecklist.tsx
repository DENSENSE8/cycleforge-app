'use client';

/**
 * The Unbox checklist — the live "where am I" display, on the right edge.
 *
 * Mounted as the `checklist` display in the right-edge Displays push column
 * ({@link ReceivingDisplaysPushStack}). Opened via the pane scan-progress ring
 * (ring-only — no strip cell). It is the station's live "where am I": the
 * operator's first question on every carton is what is left on it.
 *
 * ## It is a second VIEW, not a second derivation
 *
 * The centre renders the same procedure as work cards
 * ({@link UnboxProcedureDeck}). Both read {@link useUnboxProcedureSteps}, so
 * there is exactly one answer to "is this step done" and the two cannot drift.
 * The rule this replaced ("exactly ONE procedure surface in Unbox") was aimed at
 * a real hazard and named the wrong thing: the danger was two derivations, not
 * two views. Two views on opposite edges answering different questions — *what
 * now* versus *where am I* — is what a bench actually needs, and it is why this
 * display came back.
 *
 * ## Live is the requirement, not a nicety
 *
 * At a scan station the operator's hands are on the product, not the mouse. This
 * is what tells them the scan landed — including a shot taken on the PHONE,
 * which is the case a focus-refetch would never show while they are looking at
 * the box. The realtime subscription lives in the shared hook so both surfaces
 * get it, and neither can be the stale one.
 *
 * ## What it replaced, and why
 *
 * Until 2026-08-01 this tab was a hand-ticked, org-editable list: a GLOBAL
 * `checklist_templates` definition managers edited through `/api/checklists`,
 * with the tick state per line in `localStorage`. It asked the operator to
 * re-state, by hand, facts the carton already knows — a box was ticked because
 * someone remembered to tick it, not because the photo existed. Steps derive
 * from the carton's own evidence now, so a step is done when the WORK is done.
 * Nothing is ticked by hand, so nothing can be ticked falsely.
 */

import { ProcedureChecklist } from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

type UnboxProcedureChecklistProps = {
  row: ReceivingLineRow;
  /**
   * Cap visible rows (scroll for the rest). Used by the scan-progress hover
   * peek — pass {@link SCAN_STATION_CHECKLIST_PREVIEW_ROWS}.
   */
  maxVisibleRows?: number;
};

/**
 * Placeholder at the real geometry while the photo counts hydrate.
 *
 * The vocabulary resolves synchronously from the row, so the row COUNT is known
 * before any state is — reserve exactly that many rows rather than collapsing to
 * a spinner and pushing the column's content down on settle.
 */
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
  const { steps, settled, stepCount, focusStep } = useUnboxProcedureSteps(row);

  const doneCount = steps.reduce((n, step) => n + (step.state === 'done' ? 1 : 0), 0);
  const allDone = steps.length > 0 && doneCount === steps.length;
  const skeletonRows =
    maxVisibleRows != null ? Math.min(stepCount, maxVisibleRows) : stepCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Unbox procedure
        </p>
        {settled && steps.length > 0 ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-role-micro uppercase tracking-wider tabular-nums ${
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
        // Clicking a row moves the CENTRE's pointer to that step — the checklist
        // is the map, the cards are the work, and the map is how you navigate.
        <ProcedureChecklist
          steps={steps}
          onSelectStep={focusStep}
          maxVisibleRows={maxVisibleRows}
        />
      ) : (
        <ProcedureSkeleton rows={skeletonRows} />
      )}
    </div>
  );
}
