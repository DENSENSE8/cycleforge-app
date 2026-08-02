'use client';

/**
 * Step pager — pinned bottom chrome, directly above the note composer.
 *
 * ## Why it is here and not after the deck
 *
 * These chips existed once as a trailer rendered *after* the procedure column.
 * The column had no scroll port of its own, so they landed in the middle of the
 * document with nothing anchoring them, and they were cut on 2026-08-02. They
 * come back in the one place a pager belongs: **beside the input**, in the same
 * pinned band as the composer that commits the work, where the operator's hand
 * already is.
 *
 * The deck itself only ever exposes ONE queued peek, so the pager is not a
 * convenience — past the next step it is the pointer path, alongside the
 * right-edge checklist.
 *
 * ## It pages POSITIONALLY. It never skips.
 *
 * `prevStep` / `nextNeighbour` are the active card's neighbours in vocabulary
 * order. They are deliberately not `nextStep`, which is the SKIP target and
 * walks past every settled step — a pager wired to that would carry the operator
 * beyond a completed step they can still reopen, silently. Paging is positional;
 * skipping is a decision, and a decision needs a waiver.
 *
 * ## Honest absence at the ends
 *
 * No neighbour ⇒ no chip. Not a disabled control and never a wrap: a disabled
 * button at the end of a nine-step procedure is chrome that says "there is more
 * here" while meaning the opposite.
 *
 * ## It hands focus straight back to the wedge
 *
 * A chip is a real `<button>`; clicking one leaves focus on it, and the next
 * scan would type into a button whose Enter re-activates it. Same 60ms defer as
 * the deck's own face clicks, so the click's focus settles first.
 */

import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * A micro pill, not a `Button` archetype: `role-micro` uppercase on a
 * `rounded-full` chip with a truncating label. Pushing it through `Button` would
 * mean overriding its variant fill, its size box and its radius — a fight the
 * DS primitive would lose in `cn()` and that would leave a Button which is not
 * shaped like one. Same call as the deck's own face controls, and marked the
 * same way (`ds-raw-button` on the element's own class list, which is where the
 * ratchet guard looks).
 */
const CHIP_CLASS =
  'inline-flex min-w-0 max-w-[14rem] items-center gap-1 rounded-full border border-border-soft bg-surface-card px-2.5 py-1 text-role-micro uppercase tracking-widest text-text-soft shadow-elev-raised transition-colors hover:text-text-default';

export function UnboxProcedurePager({ row }: { row: ReceivingLineRow }) {
  const { prevStep, nextNeighbour, settled, focusStep } = useUnboxProcedureSteps(row);

  const go = useCallback(
    (key: string) => {
      focusStep(key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
  );

  // Before evidence settles, which card is active is exactly what has not
  // resolved — a pager naming the wrong neighbours would move under the hand.
  if (!settled || (!prevStep && !nextNeighbour)) return null;

  return (
    <div className="mb-1.5 flex items-center gap-2" data-procedure-pager>
      {prevStep ? (
        <button
          type="button"
          onClick={() => go(prevStep.key)}
          className={cn('ds-raw-button', CHIP_CLASS, focusRing('control', 'neutral'))}
          data-procedure-pager-prev
        >
          <ChevronLeft className="h-3 w-3 shrink-0" />
          <span className="truncate">{prevStep.label}</span>
        </button>
      ) : null}

      {nextNeighbour ? (
        <button
          type="button"
          onClick={() => go(nextNeighbour.key)}
          className={cn('ds-raw-button', CHIP_CLASS, 'ml-auto', focusRing('control', 'neutral'))}
          data-procedure-pager-next
        >
          <span className="truncate">{nextNeighbour.label}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
        </button>
      ) : null}
    </div>
  );
}
