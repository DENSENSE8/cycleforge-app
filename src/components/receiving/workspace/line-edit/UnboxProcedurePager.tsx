'use client';

/**
 * Active step context — bottom-left under the Unbox dock Panel.
 *
 * Names the step the operator must execute right now (e.g. SHIPPING LABEL).
 * Prev / next chevrons page POSITIONALLY in vocabulary order — same contract
 * as ← / → (`useUnboxProcedureArrowKeys`) and the checklist. Not a skip walk.
 *
 * Selected face = amber bottom track + one-shot boxed selection pulse on
 * `activeKey` change (Displays armed-face tokens — never a page-local glow).
 *
 * Lives under the flush floor as the step prompt — never above the dock and
 * never top-right orientation chrome.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from '@/design-system/motion';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const LABEL_CLASS =
  'inline-flex min-w-0 max-w-[14rem] items-center gap-0.5 text-role-micro uppercase leading-none tracking-widest text-text-soft transition-colors hover:text-text-default';

export function UnboxProcedurePager({ row }: { row: ReceivingLineRow }) {
  const { steps, activeKey, prevStep, nextNeighbour, settled, focusStep } =
    useUnboxProcedureSteps(row);
  const reduce = useReducedMotion();
  const selectionPulseTransition = useMotionTransition(
    framerTransition.selectionPulse,
  );
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (!activeKey) return;
    setPulseKey((n) => n + 1);
  }, [activeKey]);

  const go = useCallback(
    (key: string) => {
      focusStep(key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    },
    [focusStep],
  );

  const active = settled && activeKey ? steps.find((s) => s.key === activeKey) : null;

  // Settled / loading — keep the under-row face mounted so the floor never
  // collapses to a lone chip. Prev jumps to the last vocabulary step.
  if (!active) {
    const last = steps.length > 0 ? steps[steps.length - 1] : null;
    return (
      <div
        className="flex min-w-0 items-center gap-1"
        data-procedure-pager
        data-procedure-active-step={settled ? 'complete' : 'pending'}
      >
        {last ? (
          <button
            type="button"
            onClick={() => go(last.key)}
            className={cn(
              'ds-raw-button inline-flex shrink-0 items-center justify-center p-0.5 text-text-soft transition-colors hover:text-text-default',
              focusRing('control', 'neutral'),
            )}
            aria-label={`Back to ${last.label}`}
            data-procedure-pager-prev
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        ) : (
          <span className="inline-flex w-4 shrink-0" aria-hidden />
        )}
        <span
          className={cn(LABEL_CLASS, 'px-1 py-0.5 text-text-default')}
          data-procedure-pager-active
        >
          <span className="truncate">
            {settled ? 'Complete' : 'Loading…'}
          </span>
        </span>
        <span className="inline-flex w-4 shrink-0" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-procedure-pager
      data-procedure-active-step={active.key}
    >
      {prevStep ? (
        <button
          type="button"
          onClick={() => go(prevStep.key)}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center p-0.5 text-text-soft transition-colors hover:text-text-default',
            focusRing('control', 'neutral'),
          )}
          aria-label={`Back to ${prevStep.label}`}
          data-procedure-pager-prev
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      ) : (
        <span className="inline-flex w-4 shrink-0" aria-hidden />
      )}

      <span
        className={cn(
          LABEL_CLASS,
          'relative pointer-events-none px-1 py-0.5 text-text-default',
        )}
        data-procedure-pager-active
      >
        {/* Instant armed face — amber bottom track (Displays recipe). */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 z-raised h-0.5 bg-amber-400"
          aria-hidden
          data-procedure-pager-armed-track=""
        />
        <AnimatePresence>
          {pulseKey > 0 ? (
            <motion.span
              key={`pulse-${active.key}-${pulseKey}`}
              aria-hidden
              initial={
                reduce
                  ? { opacity: 0.4, scale: 1 }
                  : { opacity: 0.9, scale: 0.98 }
              }
              animate={{ opacity: 0, scale: reduce ? 1 : 1.04 }}
              exit={{ opacity: 0 }}
              transition={selectionPulseTransition}
              className="pointer-events-none absolute inset-0 z-0 border border-amber-400 will-change-transform"
              data-procedure-pager-selection-pulse=""
            />
          ) : null}
        </AnimatePresence>
        <span className="relative z-raised truncate">{active.label}</span>
        {active.summary ? (
          <span
            className="relative z-raised shrink-0 normal-case tracking-normal text-text-soft"
            data-procedure-pager-summary
          >
            · {active.summary}
          </span>
        ) : null}
      </span>

      {nextNeighbour ? (
        <button
          type="button"
          onClick={() => go(nextNeighbour.key)}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center p-0.5 text-text-soft transition-colors hover:text-text-default',
            focusRing('control', 'neutral'),
          )}
          aria-label={`Next: ${nextNeighbour.label}`}
          data-procedure-pager-next
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : (
        <span className="inline-flex w-4 shrink-0" aria-hidden />
      )}
    </div>
  );
}
