'use client';

/**
 * The Unbox WORK SURFACE — the guided step stack.
 *
 * The adapter, and the only module that knows both the carton domain and the DS
 * {@link ProcedureStack}. It resolves one carton's facts into rows, picks each
 * step's body from {@link UNBOX_STEP_BODIES}, and re-derives nothing.
 *
 * ## Why this is in the centre, after two rejections
 *
 * A step surface in the work canvas was built and deleted twice — the
 * mid-canvas `UnboxCaptureStack` ("completely terrible") and the ambient
 * right-rail region ("an absolutely terrible display"). What is different here,
 * and what must stay true, is the shape: **row-focused, locked width, anchored
 * to the composer, terminating in a receipt.** A free-floating mid-canvas card
 * is the rejected surface rebuilt.
 *
 * The first attempt's specific failure was hiding pending steps and reordering
 * completed ones so the current card could sit at the bottom, which made the
 * procedure unreadable AS a procedure. So every step renders, in vocabulary
 * order, always.
 *
 * ## The pointer is resolved ONCE, not scanned for locally
 *
 * `resolveActiveStep` is shared with the receipt read model. "The first pending
 * step" is short enough to re-type here, which is exactly the trap: once skips
 * exist the rule is no longer "first pending" (a waived step is settled but not
 * done), and a second reader still scanning for `pending` would park the
 * operator on a step they already waived. Two readers, one answer.
 *
 * ## Skips are not wired yet, deliberately
 *
 * The waiver store, the `unbox_step_skip` reason vocabulary and the skip routes
 * are BE-3b, which has not landed. The stack supports `skipped` end-to-end as a
 * state — the pointer walks past it, the row renders with its own glyph and
 * never a check — but no writer is mounted, so `onSkip` is omitted and the peek
 * does not render. Wiring a UI-only skip would produce a waiver that vanishes on
 * reload, which is worse than no skip at all: the operator would believe a
 * decision was recorded.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ProcedureStack, type ProcedureStepRow } from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import {
  captureStepVocabulary,
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from '../derive-capture-step-states';
import { UNBOX_STEP_BODIES } from './steps';
import type { UnboxStepBodyContext } from './steps';
import { resolveActiveStep, resolveNextStepAfter } from '@/lib/receiving/procedure-pointer';
import { useReceivingPhotoStageCounts } from '@/hooks/useReceivingPhotoCount';
import { useSetting } from '@/hooks/useSettings';
import { parsePhotoAspectList } from '@/lib/photos/photo-aspects';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { isReturnIntake, isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
import { conditionLabel } from '@/lib/conditions';
import { formatTime12hPST } from '@/utils/date';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Right-hand fact per step — what the operator scans the row for. */
function stepSummary(
  key: string,
  ctx: {
    arrival: number;
    cartonAspect: Partial<Record<string, number>>;
    item: number;
    serialCount: number;
    quantityExpected: number;
    conditionGrade: string | null;
    classified: boolean;
    aspect?: string;
  },
): string | undefined {
  const shots = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

  switch (key) {
    case 'classify':
      return ctx.classified ? 'Classified' : undefined;
    case 'arrival_check':
      return ctx.arrival > 0 ? shots(ctx.arrival) : undefined;
    // The three bench carton shots share a stage and are told apart by aspect —
    // a stage count here would let one photo report itself on all three rows.
    case 'shipping_label_photo':
    case 'box_photo':
    case 'packing_material': {
      const n = ctx.aspect ? (ctx.cartonAspect[ctx.aspect] ?? 0) : 0;
      return n > 0 ? shots(n) : undefined;
    }
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
 * before any state is — reserve exactly that many rows rather than collapsing to
 * a spinner and reflowing the composer underneath on settle.
 */
function StackSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="inset-cozy flex items-center gap-2">
          <SkeletonBase circle width="1rem" height="1rem" className="shrink-0" />
          <SkeletonBase width="55%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}

interface UnboxProcedureStackProps {
  row: ReceivingLineRow;
  staffId: string;
  /** The carton's line list — the `contents` step's body. */
  contentsSlot?: ReactNode;
  /** The classify editor — the `classify` step's body. */
  classifySlot?: ReactNode;
  /** The serial field + waiver — the `serial` step's body. */
  serialSlot?: ReactNode;
  /** Per-line item capture — the `item_photos` step's body. */
  itemPhotoSlot?: ReactNode;
  /** The grade slice for the `condition` step. Omit to render honest absence. */
  condition?: { value: string; onChange: (next: string) => void };
}

export function UnboxProcedureStack({
  row,
  staffId,
  contentsSlot,
  classifySlot,
  serialSlot,
  itemPhotoSlot,
  condition,
}: UnboxProcedureStackProps) {
  const counts = useReceivingPhotoStageCounts(row.receiving_id, row.id);

  // Which item shots BLOCK the step is org policy, never a constant — a
  // hardcoded six-shot minimum makes the step un-completable for a two-person
  // reseller. An org that clears the setting means "any item photo counts".
  const { value: requiredAspectsRaw } = useSetting<string>(
    'receiving',
    'receiving.requiredItemPhotoAspects',
  );
  const requiredItemAspects = useMemo(
    () => parsePhotoAspectList(requiredAspectsRaw ?? 'included,serial'),
    [requiredAspectsRaw],
  );

  // The operator clicked a settled row to go back to it. Cleared on carton
  // change by the key on this component's mount site, not tracked here.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

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
      cartonAspectCounts: counts.cartonAspect,
      itemAspectCounts: counts.itemAspect,
      requiredItemAspects,
      conditionGradedAt: row.condition_graded_at ?? null,
      contentsConfirmedAt: row.contents_confirmed_at ?? null,
      classified,
      photoCount: counts.total,
      serialCount,
      serialAbsent: !!row.serial_absent,
      perUnitAbsentCount,
      quantityExpected,
    }),
    [
      row,
      counts,
      classified,
      serialCount,
      perUnitAbsentCount,
      quantityExpected,
      requiredItemAspects,
    ],
  );

  // Aspect per step, straight off the declaration — never inferred from the key.
  const aspectByKey = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const step of captureStepVocabulary(input.vocabulary)) {
      map[step.key] = step.aspect;
    }
    return map;
  }, [input.vocabulary]);

  const derived = useMemo(() => deriveProcedureSteps(input), [input]);

  const steps: ProcedureStepRow[] = useMemo(() => {
    const ctx = {
      arrival: counts.arrivalPackage,
      cartonAspect: counts.cartonAspect as Partial<Record<string, number>>,
      item: counts.item,
      serialCount,
      quantityExpected,
      conditionGrade: row.condition_grade ?? null,
      classified,
    };
    return derived.map((step) => ({
      key: step.key,
      label: step.label,
      // `deriveProcedureSteps` never reports `skipped` — completion is derived
      // and a waiver is stored, and the waiver store is BE-3b. When it lands,
      // fold it in HERE, so the pointer and the rows read one list.
      state: step.state,
      position: step.position,
      summary: stepSummary(step.key, { ...ctx, aspect: aspectByKey[step.key] }),
    }));
  }, [
    derived,
    counts,
    serialCount,
    quantityExpected,
    row.condition_grade,
    classified,
    aspectByKey,
  ]);

  // ONE pointer, shared with the receipt. Not a local "first pending" scan.
  const pointerSteps = useMemo(
    () => derived.map((step) => ({ key: step.key, done: step.state === 'done' })),
    [derived],
  );
  const activeKey = resolveActiveStep(pointerSteps, { focusedKey });
  const nextKey = activeKey ? resolveNextStepAfter(pointerSteps, activeKey) : null;
  const nextStep = nextKey ? steps.find((step) => step.key === nextKey) ?? null : null;

  const onReopen = useCallback((key: string) => setFocusedKey(key), []);

  const renderActive = useCallback(
    (step: ProcedureStepRow) => {
      const Body = UNBOX_STEP_BODIES[step.key];
      // A declared step with no body is a CI failure
      // (`procedure-step-body.guard.test.ts`), never a crash at the bench.
      if (!Body) return null;
      const ctx: UnboxStepBodyContext & {
        condition?: { value: string; onChange: (next: string) => void };
      } = {
        row,
        receivingId: row.receiving_id ?? 0,
        staffId,
        aspect: (aspectByKey[step.key] ?? null) as UnboxStepBodyContext['aspect'],
        poRef: row.zoho_purchaseorder_number ?? null,
        poRouteRef:
          row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null,
        contentsSlot,
        classifySlot,
        serialSlot,
        itemPhotoSlot,
        condition,
      };
      return <Body {...ctx} />;
    },
    [row, staffId, aspectByKey, contentsSlot, classifySlot, serialSlot, itemPhotoSlot, condition],
  );

  // Gate on settled evidence: un-hydrated zeros read as "nothing shot", which
  // would mark the wrong step active for a beat and then jump under the cursor.
  if (!counts.settled) {
    return <StackSkeleton rows={captureStepVocabulary(input.vocabulary).length} />;
  }

  return (
    <ProcedureStack
      steps={steps}
      activeKey={activeKey}
      nextStep={nextStep}
      renderActive={renderActive}
      onReopen={onReopen}
      // A static instant, not a running clock. The carton's open time is a fact;
      // an elapsed timer on a bench reads as pressure, and the only honest total
      // (open → received) is not final until the carton closes, at which point
      // the receipt owns it.
      headerStart={
        row.unbox_opened_at ? formatTime12hPST(row.unbox_opened_at) : undefined
      }
      // headerEnd ships EMPTY by ruling — see ProcedureStack's prop docs.
    />
  );
}
