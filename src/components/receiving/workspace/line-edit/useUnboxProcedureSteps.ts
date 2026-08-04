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
import {
  resolveContextFromFlags,
  UNBOX_FLOW_LABEL,
  type UnboxFlowId,
} from '@/lib/stations/procedure';
import { conditionLabel } from '@/lib/conditions';
import {
  formatDateTimePST,
  formatTime12hPST,
  getCurrentPSTDateKey,
  toPSTDateKey,
} from '@/utils/date';
import type { ProcedureStepRow } from '@/design-system/components/procedure';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * A settled step's completion instant, for the deck's history rows.
 *
 * Same-day work is the overwhelming case at a bench, and a date the operator
 * already knows costs the row width it needs for the label — so today shows a
 * clock and anything older shows the date too. Both go through `@/utils/date`
 * against the warehouse zone: a raw `toLocaleTimeString` would render the
 * viewer's zone, and a receipt read on a laptop in another state would then
 * disagree with the bench about when the box was opened.
 */
function formatStepAt(at: string | null): string | undefined {
  if (!at) return undefined;
  const dayKey = toPSTDateKey(at);
  if (!dayKey) return undefined;
  return dayKey === getCurrentPSTDateKey() ? formatTime12hPST(at) : formatDateTimePST(at);
}

/** The LATER of two instants — the fold for a gate that spans several facts. */
function later(a: string | null, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(tb)) return a;
  if (!Number.isFinite(ta)) return b;
  return tb > ta ? b : a;
}

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
    labelPreviewed: boolean;
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
    case 'label':
      // "Checked", not the label KIND: the kind lives on the station controller,
      // and a summary that needed it would make this hook depend on that god
      // object for one word.
      return ctx.labelPreviewed ? 'Checked' : undefined;
    default:
      return undefined;
  }
}

interface UnboxProcedureStepsResult {
  /** Every step, in vocabulary order, with state + summary + time. */
  steps: ProcedureStepRow[];
  /** Named Unbox flow for this carton (Found · Unfound · Return). */
  flow: UnboxFlowId;
  /** Operator-voiced flow label for checklist / receipt chrome. */
  flowLabel: string;
  /** The step the operator is on. `null` ⇒ every step settled. */
  activeKey: string | null;
  /** What a skip would advance TO — the skip target, not the next card. */
  nextStep: ProcedureStepRow | null;
  /**
   * The active card's NEIGHBOURS in vocabulary order — what the pager pages to.
   *
   * Deliberately NOT {@link UnboxProcedureStepsResult.nextStep}: that is the
   * SKIP target, which walks past every settled step, so a pager wired to it
   * would silently carry the operator beyond a completed step they can still
   * reopen. Paging is positional; skipping is a decision. `null` at the ends —
   * honest absence, never a disabled control that wraps.
   */
  prevStep: ProcedureStepRow | null;
  nextNeighbour: ProcedureStepRow | null;
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

  const vocabulary = useMemo(
    () =>
      resolveContextFromFlags({
        isUnfound: !row.zoho_purchaseorder_id,
        isLocalPickup: isLocalPickupFulfillment(row),
        isReturn: isReturnIntake(row),
      }),
    [row],
  );
  const flow = vocabulary.flow;
  const flowLabel = UNBOX_FLOW_LABEL[flow];

  // Aspect + stage per step, straight off the declaration — never inferred from
  // the key. Both the capture bodies and the evidence-time fold below read this,
  // so a step's photo binding is stated once.
  const stepMeta = useMemo(() => {
    const map: Record<string, { aspect?: PhotoAspect; stage?: string }> = {};
    for (const step of captureStepVocabulary(vocabulary)) {
      map[step.key] = { aspect: step.aspect, stage: step.stage };
    }
    return map;
  }, [vocabulary]);

  const aspectByKey = useMemo(() => {
    const map: Record<string, PhotoAspect | undefined> = {};
    for (const [key, meta] of Object.entries(stepMeta)) map[key] = meta.aspect;
    return map;
  }, [stepMeta]);

  /**
   * When each photo step's gate closed — resolved from the payload the bench
   * already holds, keyed off the declared stage/aspect rather than the step name.
   *
   * `classify` and `serial` are deliberately absent: neither leaves a client-side
   * instant (classification's attested time is an audit row, and a serial row
   * carries no timestamp on this read), so the deck renders honest absence rather
   * than the nearest number to hand. The receipt, which can see both, still fills
   * them — the two surfaces answer the same question with what each actually
   * knows, never with a guess.
   */
  const evidenceAt = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const [key, meta] of Object.entries(stepMeta)) {
      if (meta.stage === 'arrival_package') {
        map[key] = counts.arrivalFirstAt;
      } else if (meta.stage === 'unbox_carton') {
        map[key] = meta.aspect ? (counts.cartonAspectFirstAt[meta.aspect] ?? null) : null;
      } else if (meta.stage === 'unbox_item') {
        // This gate spans a SET, so it closes when the LAST required aspect
        // first got a shot — not when the first item photo landed. With no
        // required aspects the org said "any item photo counts", and then the
        // first one is exactly when it closed.
        map[key] =
          requiredItemAspects.length === 0
            ? counts.itemFirstAt
            : requiredItemAspects.reduce<string | null>(
                (acc, aspect) => later(acc, counts.itemAspectFirstAt[aspect]),
                null,
              );
      }
    }
    return map;
  }, [stepMeta, counts, requiredItemAspects]);

  const input: DeriveCaptureStepStatesInput = useMemo(
    () => ({
      vocabulary,
      evidenceAt,
      arrivalPhotoCount: counts.arrivalPackage,
      unboxCartonPhotoCount: counts.unboxCarton,
      itemPhotoCount: counts.item,
      cartonAspectCounts: counts.cartonAspect,
      itemAspectCounts: counts.itemAspect,
      requiredItemAspects,
      conditionGradedAt: row.condition_graded_at ?? null,
      contentsConfirmedAt: row.contents_confirmed_at ?? null,
      labelPreviewedAt: row.label_previewed_at ?? null,
      classified,
      photoCount: counts.total,
      serialCount,
      serialAbsent: !!row.serial_absent,
      perUnitAbsentCount,
      quantityExpected,
    }),
    [
      row,
      vocabulary,
      evidenceAt,
      counts,
      classified,
      serialCount,
      perUnitAbsentCount,
      quantityExpected,
      requiredItemAspects,
    ],
  );

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
      labelPreviewed: !!row.label_previewed_at,
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
      // Formatted HERE, not in the derivation: that module is shared with a
      // server read model whose consumers format for their own surface.
      // `undefined` (not an empty string) so the row renders nothing at all.
      at: formatStepAt(step.at),
    }));
  }, [
    derived,
    counts,
    serialCount,
    quantityExpected,
    row.condition_grade,
    row.label_previewed_at,
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

  // Positional neighbours, for the pager pinned above the composer. They were
  // cut on 2026-08-02 when the chips rendered as a trailer after the deck and
  // landed mid-document; they came back the same day as pinned bottom chrome,
  // which is where a pager belongs — beside the input, not after the content.
  //
  // Vocabulary order, NOT `skipTargetKey`. That distinction is the whole reason
  // these are separate values.
  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;
  const prevStep = activeIndex > 0 ? steps[activeIndex - 1] : null;
  const nextNeighbour =
    activeIndex >= 0 && activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;

  const focusStep = useCallback(
    (key: string | null) => setFocusedStep(cartonId, key),
    [cartonId],
  );

  return {
    steps,
    flow,
    flowLabel,
    activeKey,
    nextStep,
    prevStep,
    nextNeighbour,
    aspectByKey,
    settled: counts.settled,
    stepCount: captureStepVocabulary(input.vocabulary).length,
    focusStep,
  };
}
