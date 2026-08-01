'use client';

import { useMemo } from 'react';
import { CaptureStack, CaptureStackRow } from '@/design-system/components/capture-stack';
import { StepDot } from './ReceivingProgressStepper';
import {
  deriveCaptureStackRows,
  type CaptureStackStepRow,
  type DeriveCaptureStepStatesInput,
} from './derive-capture-step-states';
import { useReceivingPhotoStageCounts } from '@/hooks/useReceivingPhotoCount';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { isReturnIntake, isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
import { conditionLabel } from '@/lib/conditions';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Capture stack, READ-ONLY (capture-stack PLAN Phase 2).
 *
 * Renders the carton's step procedure as the bottom-anchored ledger the whole
 * design is built on: every completed step collapsed to one line and pushed up,
 * the current step expanded at the bottom. **It captures nothing** — the PO
 * accordion below still owns every write, and the anchored input arrives in
 * Phase 3. Mounting it read-only proves row anatomy, collapse density, push-up
 * motion, and the desktop ergonomics (PLAN §4) on real cartons at zero risk.
 *
 * Composes the promoted primitive (`CaptureStack` + `CaptureStackRow`) and the
 * step vocabulary SoT (`derive-capture-step-states`). No layout, no motion, and
 * no step ordering is re-implemented here — this file is the domain renderer
 * only, per the primitive's `renderRow` contract.
 */

/** Right-hand summary for a collapsed row — what the operator scans for. */
function stepSummary(
  step: CaptureStackStepRow,
  ctx: {
    arrivalPhotoCount: number;
    unboxCartonPhotoCount: number;
    itemPhotoCount: number;
    serialCount: number;
    quantityExpected: number;
    conditionGrade: string | null;
    classified: boolean;
  },
): string {
  const shots = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

  switch (step.key) {
    case 'classify':
      return ctx.classified ? 'Classified' : 'Not classified';
    case 'po_photos':
      return ctx.arrivalPhotoCount > 0 ? shots(ctx.arrivalPhotoCount) : 'None at the door';
    case 'packing_material':
      return ctx.unboxCartonPhotoCount > 0 ? shots(ctx.unboxCartonPhotoCount) : 'Not shot';
    case 'item_photos':
      return ctx.itemPhotoCount > 0 ? shots(ctx.itemPhotoCount) : 'Not shot';
    case 'condition':
      // Ungated: always shows the grade the line already carries (auto-A UX).
      return conditionLabel(ctx.conditionGrade ?? '', 'compact');
    case 'serial': {
      // Multi-qty is a loop, not a step — report `n of N` so the row says how
      // much of the loop is done. The loop mechanics land in Phase 3.
      if (ctx.quantityExpected > 1) return `${ctx.serialCount} of ${ctx.quantityExpected}`;
      return ctx.serialCount > 0 ? 'Captured' : 'Not scanned';
    }
  }
}

export function UnboxCaptureStack({
  row,
  className,
}: {
  row: ReceivingLineRow;
  className?: string;
}) {
  const stageCounts = useReceivingPhotoStageCounts(row.receiving_id, row.id);

  const serials = Array.isArray(row.serials) ? row.serials : [];
  const serialCount = serials.length;
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
      arrivalPhotoCount: stageCounts.arrivalPackage,
      unboxCartonPhotoCount: stageCounts.unboxCarton,
      itemPhotoCount: stageCounts.item,
      classified,
      // Shared matched-flow gate inputs (serial waiver accounting).
      photoCount: stageCounts.total,
      serialCount,
      serialAbsent: !!row.serial_absent,
      perUnitAbsentCount,
      quantityExpected,
    }),
    [
      row,
      stageCounts,
      classified,
      serialCount,
      perUnitAbsentCount,
      quantityExpected,
    ],
  );

  const rows = useMemo(() => [...deriveCaptureStackRows(input)], [input]);

  const summaryCtx = {
    arrivalPhotoCount: stageCounts.arrivalPackage,
    unboxCartonPhotoCount: stageCounts.unboxCarton,
    itemPhotoCount: stageCounts.item,
    serialCount,
    quantityExpected,
    conditionGrade: row.condition_grade ?? null,
    classified,
  };

  if (rows.length === 0) return null;

  return (
    <CaptureStack<CaptureStackStepRow>
      // Gate on settled evidence counts. Un-hydrated zeros read as "nothing
      // shot", which painted "PO / box photos — current step" on a carton that
      // already had all three photos, then jumped to Serial once the query
      // landed. A confident wrong active step is worse than a beat of loading.
      // (Found by the Phase 2 bench trial.)
      isLoading={!stageCounts.settled}
      rows={stageCounts.settled ? rows : []}
      getId={(step) => step.key}
      className={className}
      renderRow={(step, ctx) => (
        <CaptureStackRow
          variant={ctx.variant}
          dataAttr={{ name: 'capture-step', value: step.key }}
        >
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            {/* `step.position` (vocabulary number), never `ctx.index` — hidden
                pending steps make the row index diverge from the step number. */}
            <StepDot
              state={step.state}
              index={step.position}
              compact={ctx.variant !== 'expanded'}
            />
            <span className="truncate text-role-caption font-semibold text-text-default">
              {step.label}
            </span>
            <span className="ml-auto truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
              {stepSummary(step, summaryCtx)}
            </span>
          </div>

          {ctx.variant === 'expanded' && (
            /* Phase 2 is read-only: the expanded card states the job and points
               at the accordion, which still owns capture. Phase 3 replaces this
               with the step's own capture surface + the anchored input. */
            <p className="mt-2 text-role-caption text-text-soft">
              {step.state === 'active'
                ? 'Current step — capture below in the PO items list.'
                : 'All steps complete.'}
            </p>
          )}
        </CaptureStackRow>
      )}
    />
  );
}
