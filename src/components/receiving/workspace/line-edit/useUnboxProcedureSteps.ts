'use client';

/**
 * ONE derivation of the Unbox procedure, for every surface that shows it.
 *
 * Two surfaces render these steps at the same time now — the work cards in the
 * centre and the reference checklist on the right edge — and they are on screen
 * *together*. Two views of one procedure are only honest if they cannot
 * disagree, and the way to guarantee that is not a rule saying "keep them in
 * sync": it is one hook, so there is only ever one answer to derive.
 *
 * That is also why the old "there is exactly ONE procedure surface" rule could
 * be relaxed. The danger was never two views; it was two derivations.
 *
 * ## Real time is the whole point at a scan station
 *
 * The operator's hands are on the product, and the checklist is what tells them
 * the scan landed. So this subscribes to the carton's photo realtime channel and
 * to the local `receiving-line-updated` bus, and both surfaces re-render the
 * moment evidence arrives — including evidence shot on the PHONE, which is the
 * case a poll would show a minute late and a page-focus refetch would not show
 * at all while the operator is looking at the box.
 *
 * ## It derives; it never stores a step state
 *
 * Completion comes from the carton's own facts through `deriveProcedureSteps` —
 * the same function the receipt read model calls. Nothing is ticked by hand, so
 * nothing can be ticked falsely.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  captureStepVocabulary,
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from '../derive-capture-step-states';
import { resolveActiveStep, resolveNextStepAfter } from '@/lib/receiving/procedure-pointer';
import {
  clearFocusForOtherCarton,
  setFocusedStep,
  useFocusedStep,
} from '@/lib/receiving/procedure-focus-store';
import { useReceivingPhotoStageCounts } from '@/hooks/useReceivingPhotoCount';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useSetting } from '@/hooks/useSettings';
import { refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import { parsePhotoAspectList, type PhotoAspect } from '@/lib/photos/photo-aspects';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { isReturnIntake, isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
import { conditionLabel } from '@/lib/conditions';
import type { ProcedureStepRow } from '@/design-system/components/procedure';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Right-hand fact per step — what the operator scans the card for. */
function stepSummary(
  key: string,
  ctx: {
    arrival: number;
    cartonAspect: Partial<Record<PhotoAspect, number>>;
    item: number;
    serialCount: number;
    quantityExpected: number;
    conditionGrade: string | null;
    classified: boolean;
    aspect?: PhotoAspect;
  },
): string | undefined {
  const shots = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

  switch (key) {
    case 'classify':
      return ctx.classified ? 'Classified' : undefined;
    case 'arrival_check':
      return ctx.arrival > 0 ? shots(ctx.arrival) : undefined;
    // The three bench carton shots share a stage and are told apart by aspect —
    // a stage count would let one photo report itself on all three cards.
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

export interface UnboxProcedureStepsResult {
  /** Every step, in vocabulary order, with state + summary + time. */
  steps: ProcedureStepRow[];
  /** The step the operator is on. `null` ⇒ every step settled. */
  activeKey: string | null;
  /** What a skip would advance TO. NOT the column's next section — see `nextKey`. */
  nextStep: ProcedureStepRow | null;
  /**
   * The column section BEFORE the active one, in vocabulary order, whatever its
   * state. `null` at the head. Drives the `‹ back` chip.
   */
  prevKey: string | null;
  /**
   * The column section AFTER the active one, in vocabulary order, whatever its
   * state. `null` at the tail. Drives the `next ›` chip.
   *
   * Distinct from {@link nextStep}, which skips settled steps.
   */
  nextKey: string | null;
  /** Declared photo aspect per step key — never inferred from the key. */
  aspectByKey: Record<string, PhotoAspect | undefined>;
  /** Evidence has arrived, so a zero means "nothing shot", not "not loaded". */
  settled: boolean;
  /** Row count for a skeleton at the real geometry. */
  stepCount: number;
  /** Jump the pointer to a settled step (the reopen affordance). */
  focusStep: (key: string | null) => void;
}

export function useUnboxProcedureSteps(row: ReceivingLineRow): UnboxProcedureStepsResult {
  const queryClient = useQueryClient();
  const counts = useReceivingPhotoStageCounts(row.receiving_id, row.id);

  // Live evidence. Without this the checklist is a snapshot from whenever the
  // panel mounted — and a station display that lags the scan is worse than no
  // display, because the operator trusts it and re-shoots.
  const refreshPhotos = useCallback(() => {
    if (row.receiving_id != null) refreshReceivingPhotos(queryClient, row.receiving_id);
  }, [queryClient, row.receiving_id]);
  useReceivingPhotosRealtimeRefresh(row.receiving_id, 0, refreshPhotos);

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

  // Shared across surfaces, not per-component: the checklist is the map and
  // clicking a row there must move the CENTRE's card. Two `useState` pointers
  // would render two answers on one screen.
  const cartonId = row.receiving_id ?? null;
  const focusedKey = useFocusedStep(cartonId);
  // A focus belonging to a previous carton must never open the new one parked
  // on it — same class of bug as a selection bleeding across modes.
  useEffect(() => {
    clearFocusForOtherCarton(cartonId);
  }, [cartonId]);

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
    const map: Record<string, PhotoAspect | undefined> = {};
    for (const step of captureStepVocabulary(input.vocabulary)) {
      map[step.key] = step.aspect;
    }
    return map;
  }, [input.vocabulary]);

  const derived = useMemo(() => deriveProcedureSteps(input), [input]);

  const steps: ProcedureStepRow[] = useMemo(() => {
    const ctx = {
      arrival: counts.arrivalPackage,
      cartonAspect: counts.cartonAspect,
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
      // and a waiver is stored, and the waiver store is BE-3b. Fold it in HERE
      // when it lands, so both surfaces and the pointer read one list.
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

  // ONE pointer, shared with the receipt read model. Not a local "first pending"
  // scan — once skips exist that rule is wrong, and a second reader would park
  // the operator on a step they already waived.
  const pointerSteps = useMemo(
    () => derived.map((step) => ({ key: step.key, done: step.state === 'done' })),
    [derived],
  );
  const activeKey = resolveActiveStep(pointerSteps, { focusedKey });
  const skipTargetKey = activeKey ? resolveNextStepAfter(pointerSteps, activeKey) : null;
  const nextStep = skipTargetKey
    ? (steps.find((step) => step.key === skipTargetKey) ?? null)
    : null;

  // COLUMN NEIGHBOURS — the sections either side of the active one in vocabulary
  // order, whatever their state.
  //
  // Deliberately NOT `nextStep`. That one is the SKIP target — the next step
  // still unsettled — which is the right answer for "what does waiving this
  // advance to" and the wrong one for a paging chip: it would send the operator
  // straight past a settled step they can still scroll back to and reopen. The
  // column is the vocabulary, so its neighbours are the vocabulary's.
  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;
  const prevKey = activeIndex > 0 ? (steps[activeIndex - 1]?.key ?? null) : null;
  const nextKey =
    activeIndex >= 0 && activeIndex < steps.length - 1
      ? (steps[activeIndex + 1]?.key ?? null)
      : null;

  const focusStep = useCallback(
    (key: string | null) => setFocusedStep(cartonId, key),
    [cartonId],
  );

  return {
    steps,
    activeKey,
    nextStep,
    aspectByKey,
    settled: counts.settled,
    stepCount: captureStepVocabulary(input.vocabulary).length,
    focusStep,
  };
}
