'use client';

/**
 * Active step context — Band 2 left under the Unbox dock floor.
 *
 * Names the step the operator must execute right now (e.g. Label photo).
 * Prev / next chevrons page POSITIONALLY in vocabulary order — same contract
 * as ← / → (`useUnboxProcedureArrowKeys`) and the checklist. Not a skip walk.
 *
 * **Band 2 face (every step / phase):**
 *   [‹?][ Label · summary ][›?] ……………… | [progress]
 *
 * Label + chevrons are a **left cluster** — the next arrow sits **just to the
 * right of the text**, never at the far right of the band (progress owns that).
 * Sentence case (never CSS `uppercase`). White floor.
 * Guard: `unbox-dock-one-shell.guard.test.ts`.
 */

import { useCallback, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const CHEVRON_CELL =
  'inline-flex h-full w-8 shrink-0 items-center justify-center text-text-soft transition-colors hover:bg-surface-sunken hover:text-text-default disabled:pointer-events-none disabled:opacity-35';

/**
 * Label is content-sized (not flex-1) so › sits immediately after the text.
 * `leading-tight` (not `leading-none`) — Band 2 is h-8; none clips caption
 * descenders (g / p / y in "Shipping label").
 */
const LABEL_FACE =
  'flex min-w-0 max-w-full items-center justify-start gap-1 overflow-visible px-2 text-role-caption font-medium leading-tight tracking-normal text-text-default';

export function UnboxProcedurePager({ row }: { row: ReceivingLineRow }) {
  const { steps, activeKey, prevStep, nextNeighbour, settled, focusStep } =
    useUnboxProcedureSteps(row);

  const go = useCallback(
    (key: string) => {
      focusStep(key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
  );

  const active = settled && activeKey ? steps.find((s) => s.key === activeKey) : null;

  // Both chevrons always mount (same w-8 cells) so left/right chrome matches.
  // Disabled at the ends. Settled / loading: ‹ rewinds to the last step.
  const prevTarget = (() => {
    if (!active) {
      return steps.length > 0 ? steps[steps.length - 1] : null;
    }
    return prevStep;
  })();
  const nextTarget = active ? nextNeighbour : null;

  const prevCell: ReactNode = (
    // ds-raw-button: Band 2 flush chevron — full-height abutting segment
    <button
      type="button"
      onClick={() => {
        if (prevTarget) go(prevTarget.key);
      }}
      disabled={!prevTarget}
      className={cn('ds-raw-button', CHEVRON_CELL, focusRing('control', 'neutral'))}
      aria-label={prevTarget ? `Back to ${prevTarget.label}` : 'Back'}
      data-procedure-pager-prev
    >
      <ChevronLeft className="h-3 w-3" />
    </button>
  );

  const nextCell: ReactNode = (
    // ds-raw-button: Band 2 flush chevron — mirrors prev width / pad
    <button
      type="button"
      onClick={() => {
        if (nextTarget) go(nextTarget.key);
      }}
      disabled={!nextTarget}
      className={cn('ds-raw-button', CHEVRON_CELL, focusRing('control', 'neutral'))}
      aria-label={nextTarget ? `Next: ${nextTarget.label}` : 'Next'}
      data-procedure-pager-next
    >
      <ChevronRight className="h-3 w-3" />
    </button>
  );

  const labelBody: ReactNode = !active ? (
    <span className={LABEL_FACE} data-procedure-pager-active>
      <span className="truncate leading-tight">{settled ? 'Complete' : 'Loading…'}</span>
    </span>
  ) : (
    <span className={LABEL_FACE} data-procedure-pager-active>
      <span className="truncate leading-tight">{active.label}</span>
      {active.summary ? (
        <span
          className="shrink-0 normal-case leading-tight tracking-normal text-text-soft"
          data-procedure-pager-summary
        >
          · {active.summary}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      className="flex h-full w-full min-w-0 items-stretch gap-0 bg-surface-card"
      data-procedure-pager
      data-procedure-active-step={
        active ? active.key : settled ? 'complete' : 'pending'
      }
    >
      {/* Left cluster — chevrons hug the label; remaining width stays empty. */}
      <div
        className="flex h-full min-w-0 max-w-full items-stretch gap-0"
        data-procedure-pager-cluster
      >
        {prevCell}
        {labelBody}
        {nextCell}
      </div>
      <div className="min-w-0 flex-1" aria-hidden />
    </div>
  );
}
