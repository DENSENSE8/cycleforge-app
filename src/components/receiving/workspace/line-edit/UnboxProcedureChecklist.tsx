'use client';

/**
 * The Unbox checklist — and the checklist IS the derived procedure.
 *
 * Mounted as the `checklist` display in the right-edge Displays push column
 * ({@link ReceivingDisplaysPushStack}), the same column that expands out every
 * other Unbox reference surface. There is exactly ONE checklist in the product
 * and this is it.
 *
 * ## What it replaced, and why
 *
 * Until 2026-08-01 this tab was a hand-ticked, org-editable list: a GLOBAL
 * `checklist_templates` definition managers edited through `/api/checklists`,
 * with the tick state per line in `localStorage`. It asked the operator to
 * re-state, by hand, facts the carton already knows — a box was ticked because
 * someone remembered to tick it, not because the photo existed. The steps now
 * derive from the carton's own evidence (photo stages, serials, condition,
 * classification), so a step is done when the WORK is done. Nothing is ticked
 * by hand, so nothing can be ticked falsely.
 *
 * ## Composition
 *
 * Step order and state come from {@link deriveProcedureSteps} only — never
 * re-derived here. Hardcoding the five steps is what breaks unfound, local
 * pickup, returns and multi-qty; the vocabulary is data. Rendering is the
 * station-agnostic DS {@link ProcedureChecklist}; this module is the adapter
 * that resolves one carton's facts into its props.
 */

import { useMemo } from 'react';
import {
  ProcedureChecklist,
  type ProcedureChecklistStep,
} from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import {
  captureStepVocabulary,
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from '../derive-capture-step-states';
import { useReceivingPhotoStageCounts } from '@/hooks/useReceivingPhotoCount';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { isReturnIntake, isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
import { conditionLabel } from '@/lib/conditions';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Right-hand fact per step — what the operator scans the row for. */
function stepSummary(
  key: string,
  ctx: {
    arrival: number;
    unboxCarton: number;
    item: number;
    serialCount: number;
    quantityExpected: number;
    conditionGrade: string | null;
    classified: boolean;
  },
): string | undefined {
  const shots = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

  switch (key) {
    case 'classify':
      return ctx.classified ? 'Classified' : undefined;
    case 'po_photos':
      return ctx.arrival > 0 ? shots(ctx.arrival) : undefined;
    case 'packing_material':
      return ctx.unboxCarton > 0 ? shots(ctx.unboxCarton) : undefined;
    case 'item_photos':
      return ctx.item > 0 ? shots(ctx.item) : undefined;
    case 'condition':
      return conditionLabel(ctx.conditionGrade ?? '', 'compact');
    case 'serial':
      // Multi-qty is a loop, not a step — say how much of the loop is done.
      return ctx.quantityExpected > 1
        ? `${ctx.serialCount} of ${ctx.quantityExpected}`
        : ctx.serialCount > 0
          ? 'Captured'
          : undefined;
    default:
      return undefined;
  }
}

/**
 * Placeholder at the real geometry while the photo counts hydrate.
 *
 * The vocabulary resolves synchronously from the row, so the row COUNT is known
 * before any state is — reserve exactly that many rows rather than collapsing
 * to a spinner and pushing the column's content down on settle.
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

export function UnboxProcedureChecklist({ row }: { row: ReceivingLineRow }) {
  const counts = useReceivingPhotoStageCounts(row.receiving_id, row.id);

  const serialCount = Array.isArray(row.serials) ? row.serials.length : 0;
  const quantityExpected = Math.max(0, Number(row.quantity_expected ?? 0));
  const perUnitAbsentCount = (row.units ?? []).filter((u) => u.serial_absent).length;
  const classified = isIntakeClassified(row);

  const input: DeriveCaptureStepStatesInput = useMemo(
    () => ({
      vocabulary: {
        isUnfound: !row.zoho_purchaseorder_id,
        isLocalPickup: isLocalPickupFulfillment(row),
        isReturn: isReturnIntake(row),
      },
      arrivalPhotoCount: counts.arrivalPackage,
      unboxCartonPhotoCount: counts.unboxCarton,
      itemPhotoCount: counts.item,
      classified,
      photoCount: counts.total,
      serialCount,
      serialAbsent: !!row.serial_absent,
      perUnitAbsentCount,
      quantityExpected,
    }),
    [row, counts, classified, serialCount, perUnitAbsentCount, quantityExpected],
  );

  const steps: ProcedureChecklistStep[] = useMemo(() => {
    const ctx = {
      arrival: counts.arrivalPackage,
      unboxCarton: counts.unboxCarton,
      item: counts.item,
      serialCount,
      quantityExpected,
      conditionGrade: row.condition_grade ?? null,
      classified,
    };
    return deriveProcedureSteps(input).map((step) => ({
      key: step.key,
      label: step.label,
      state: step.state,
      position: step.position,
      summary: stepSummary(step.key, ctx),
    }));
  }, [input, counts, serialCount, quantityExpected, row.condition_grade, classified]);

  const doneCount = steps.reduce((n, step) => n + (step.state === 'done' ? 1 : 0), 0);
  const allDone = steps.length > 0 && doneCount === steps.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Unbox procedure
        </p>
        {counts.settled && steps.length > 0 ? (
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
      {counts.settled ? (
        <ProcedureChecklist steps={steps} />
      ) : (
        <ProcedureSkeleton rows={captureStepVocabulary(input.vocabulary).length} />
      )}
    </div>
  );
}
