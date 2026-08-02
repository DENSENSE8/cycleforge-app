'use client';

/**
 * The Unbox WORK SURFACE — the horizontal procedure card rail.
 *
 * The adapter: it knows both the carton domain and the DS {@link ProcedureCards},
 * and nothing else does. Steps come from {@link useUnboxProcedureSteps} — the
 * same hook the right-edge checklist reads — so the two surfaces on screen
 * cannot disagree about where the operator is. It re-derives nothing.
 *
 * ## Why the centre is cards and the right edge is a checklist
 *
 * They answer different questions, which is why both exist:
 *
 *   centre  → *what do I do right now* — one expanded card carrying that step's
 *             own controls, with its neighbours visible as faces either side
 *   right   → *where am I in the whole job* — every step, one line each, live
 *
 * Two VIEWS are fine; two DERIVATIONS are not. The hook is the guarantee.
 *
 * ## The rail never takes focus
 *
 * No `autoFocus`, no `tabIndex` on the rail; the active card is scrolled into
 * view, never focused. The scan bar owns focus, and a card that steals it drops
 * scans silently.
 *
 * ## Skips are not wired yet
 *
 * The waiver store, the `unbox_step_skip` vocabulary and the skip routes are
 * BE-3b, which has not landed. `skipped` is supported end-to-end as a STATE (the
 * pointer walks past it, the card wears its own glyph and never a check) but no
 * writer is mounted. A UI-only skip would produce a waiver that vanishes on
 * reload, which is worse than none: the operator would believe a decision was
 * recorded.
 */

import { useCallback, type ReactNode } from 'react';
import { ProcedureCards, type ProcedureStepRow } from '@/design-system/components/procedure';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { UNBOX_STEP_BODIES, type UnboxStepBodyContext } from './steps';
import {
  stepAccentClass,
  stepFace,
  stepMedallionClass,
  stepQuantityClass,
} from './steps/step-face';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Placeholder at the real geometry while the photo counts hydrate.
 *
 * The vocabulary resolves synchronously from the row, so the card COUNT is known
 * before any state is — reserve exactly that many cards rather than collapsing
 * to a spinner and reflowing the composer underneath on settle.
 */
function CardsSkeleton({ cards }: { cards: number }) {
  return (
    <div className="flex gap-3 overflow-hidden pb-2" aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          className="flex h-[4.5rem] w-[13.5rem] shrink-0 items-center gap-3 rounded-2xl border border-border-soft bg-surface-card px-4"
        >
          <SkeletonBase width="2.25rem" height="2.25rem" className="shrink-0 rounded-lg" />
          <SkeletonBase width="55%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}

export interface UnboxProcedureCardsProps {
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

export function UnboxProcedureCards({
  row,
  staffId,
  contentsSlot,
  classifySlot,
  serialSlot,
  itemPhotoSlot,
  condition,
}: UnboxProcedureCardsProps) {
  const { steps, activeKey, aspectByKey, settled, stepCount, focusStep } =
    useUnboxProcedureSteps(row);

  const face = useCallback((step: ProcedureStepRow) => {
    const { Icon, hue } = stepFace(step.key);
    return {
      Icon,
      medallionClass: stepMedallionClass(hue),
      accentClass: stepAccentClass(hue),
      quantityClass: stepQuantityClass(hue),
    };
  }, []);

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
        condition,
      };
      return <Body {...ctx} />;
    },
    [row, staffId, aspectByKey, contentsSlot, classifySlot, serialSlot, itemPhotoSlot, condition],
  );

  // Gate on settled evidence: un-hydrated zeros read as "nothing shot", which
  // would open the wrong card for a beat and then scroll under the operator.
  if (!settled) return <CardsSkeleton cards={stepCount} />;

  return (
    <ProcedureCards
      steps={steps}
      activeKey={activeKey}
      face={face}
      renderActive={renderActive}
      onSelectStep={focusStep}
    />
  );
}
