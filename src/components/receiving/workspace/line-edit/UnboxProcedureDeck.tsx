'use client';

/**
 * The Unbox WORK SURFACE — the procedure focus deck.
 *
 * The adapter: it knows both the carton domain and the DS {@link ProcedureDeck},
 * and nothing else does. Steps come from {@link useUnboxProcedureSteps} — the
 * same hook the right-edge checklist reads — so the two surfaces on screen
 * cannot disagree about where the operator is. It re-derives nothing.
 *
 * ## Why the centre is a deck and the right edge is a checklist
 *
 * They answer different questions, which is why both exist:
 *
 *   centre  → *what do I do right now* — one expanded card at the bottom
 *             against the composer, its history above and its queue tucked
 *             behind it
 *   right   → *where am I in the whole job* — every step, one line each, live
 *
 * Two VIEWS are fine; two DERIVATIONS are not. The hook is the guarantee.
 *
 * That coupling is also the deck's PRECONDITION, not a nicety: the centre is
 * only allowed to tuck queued cards behind one another because the checklist
 * holds the shape of the whole job. De-default the checklist and the deck goes
 * back to a flat column in the same change.
 *
 * ## The deck never takes focus — and neither does a click on it
 *
 * No `autoFocus`, no `tabIndex`; the focus card is scrolled into view, never
 * focused. But a face button DOES take focus natively when clicked, and the
 * wedge types into whatever holds focus — so every selection here hands focus
 * straight back to the scan bar. That is this adapter's job, not the DS
 * component's: the event is the station's, and the DS layer stays domain-free.
 *
 * ## The prev/next chips live on the DOCK, not here (2026-08-02)
 *
 * They were cut from this component and came back the same day as
 * {@link UnboxProcedurePager}, pinned above the composer. The cut was right and
 * the reinstatement is not a reversal of it: rendering them *after* the deck put
 * them mid-document, because this component owns no scroll port. A pager belongs
 * beside the input the operator's hand is already on — never as a trailer after
 * the content. Do not re-add chips to this file.
 *
 * ## Skips are not wired yet
 *
 * The waiver store, the `unbox_step_skip` vocabulary and the skip routes are
 * BE-3b, which has not landed. `skipped` is supported end-to-end as a STATE (the
 * pointer walks past it, the section wears its own glyph and never a check) but
 * no writer is mounted. A UI-only skip would produce a waiver that vanishes on
 * reload, which is worse than none: the operator would believe a decision was
 * recorded.
 */

import { useCallback, type ReactNode } from 'react';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  PROCEDURE_STEP_FACE_HEIGHT,
  ProcedureDeck,
  type ProcedureStepRow,
} from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { cn } from '@/utils/_cn';
import { UNBOX_STEP_BODIES, type UnboxStepBodyContext } from './steps';
import {
  stepFace,
  stepMedallionClass,
  stepQuantityClass,
  stepSurfaceClass,
} from './steps/step-face';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Placeholder at the real geometry while the photo counts hydrate.
 *
 * The vocabulary resolves synchronously from the row, so the card COUNT is known
 * before any state is — reserve exactly that many at exactly the face height
 * rather than collapsing to a spinner and reflowing the composer underneath on
 * settle. Flat, not a deck: which card takes focus is precisely what has not
 * resolved yet, and a skeleton that guessed one would move under the operator
 * the moment evidence landed.
 */
function DeckSkeleton({ sections }: { sections: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: sections }, (_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 rounded-2xl border border-border-soft bg-surface-card px-4',
            PROCEDURE_STEP_FACE_HEIGHT,
          )}
        >
          <SkeletonBase width="2.25rem" height="2.25rem" className="shrink-0 rounded-lg" />
          <SkeletonBase width="40%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}

interface UnboxProcedureDeckProps {
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
  /** The printed label preview — the `label` step's body. */
  labelSlot?: ReactNode;
  /** The grade slice for the `condition` step. Omit to render honest absence. */
  condition?: { value: string; onChange: (next: string) => void };
}

export function UnboxProcedureDeck({
  row,
  staffId,
  contentsSlot,
  classifySlot,
  serialSlot,
  itemPhotoSlot,
  labelSlot,
  condition,
}: UnboxProcedureDeckProps) {
  const { steps, activeKey, aspectByKey, settled, stepCount, focusStep } =
    useUnboxProcedureSteps(row);

  const face = useCallback((step: ProcedureStepRow) => {
    const { Icon, hue } = stepFace(step.key);
    return {
      Icon,
      medallionClass: stepMedallionClass(hue),
      surfaceClass: stepSurfaceClass(hue),
      quantityClass: stepQuantityClass(hue),
    };
  }, []);

  // Move the pointer, then give the wedge its focus back. A face or a chip is a
  // real <button>: clicking it leaves focus there, and the next scan would type
  // into the button — whose Enter would re-activate it. The failure mode is
  // invisible, which is what makes it expensive. Same 60ms defer as the other
  // station hand-backs (`scan-apply.ts`, `CartonMatchHub`), so the click's own
  // focus settles first.
  const selectStep = useCallback(
    (key: string) => {
      focusStep(key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
  );

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
        aspect: aspectByKey[step.key] ?? null,
        poRef: row.zoho_purchaseorder_number ?? null,
        poRouteRef: row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null,
        contentsSlot,
        classifySlot,
        serialSlot,
        itemPhotoSlot,
        labelSlot,
        condition,
      };
      return <Body {...ctx} />;
    },
    [
      row,
      staffId,
      aspectByKey,
      contentsSlot,
      classifySlot,
      serialSlot,
      itemPhotoSlot,
      labelSlot,
      condition,
    ],
  );

  // Gate on settled evidence: un-hydrated zeros read as "nothing shot", which
  // would open the wrong card for a beat and then scroll under the operator.
  if (!settled) return <DeckSkeleton sections={stepCount} />;

  return (
    <ProcedureDeck
      steps={steps}
      activeKey={activeKey}
      face={face}
      renderActive={renderActive}
      onSelectStep={selectStep}
    />
  );
}
