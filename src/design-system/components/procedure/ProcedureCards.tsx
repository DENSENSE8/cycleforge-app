'use client';

/**
 * Procedure cards — the station's WORK surface, as a horizontal card rail.
 *
 * Replaced the flat vertical ledger 2026-08-02 at the operator's direction. The
 * bench triages left-to-right through one card per step, Apple-Watch style: the
 * active card is expanded and carries that step's own capture controls; its
 * neighbours are compact faces you can see coming and swipe back to.
 *
 * ## Why horizontal, when a vertical pile was refused
 *
 * The refused pattern was a **depth pile** — rows layered *behind* one another,
 * which buys compression by occluding the completion times the record exists to
 * show, and hides the pending steps whose absence killed the first attempt at
 * this surface. A horizontal rail is the opposite trade: every step is a
 * first-class sibling on one axis, nothing is layered, nothing is behind
 * anything, and the pending steps stay visible as faces to the right. It spends
 * horizontal room — which a 720px column has and a 1.9-inch watch does not — to
 * buy the vertical room the composer and the label preview need underneath.
 *
 * So the ban that still stands is on **occlusion**, not on carousels. Do not
 * "restore" a z-stacked pile here.
 *
 * ## Motion: native scrolling, not an animation
 *
 * Travel between cards is CSS scroll-snap driven by the browser — not a framer
 * transition, not `layout`, not a scroll-linked timeline. That matters at scan
 * cadence: the rail advances 9–24 times per carton, and the one thing the
 * layout-animation ban exists to prevent is a surface that reflows on its own
 * that often. `scrollIntoView` with `behavior: 'smooth'` degrades to an instant
 * jump under `prefers-reduced-motion` because the browser honours it natively,
 * which is the correct reduced form — a cut, not a crawl.
 *
 * The active card still crossfades its CONTENTS on `activeKey`
 * (`stationCartonSwap`, the station-cadence preset). Card WIDTH changes are a
 * plain reflow in one un-animated frame.
 *
 * ## It never takes focus
 *
 * No `autoFocus`, no focus trap, no `tabIndex` on the rail. The scan bar owns
 * focus; a card that steals it drops scans silently, and the failure mode is
 * invisible. Scrolling the active card into view uses `block: 'nearest'` +
 * `inline: 'center'` and never `.focus()`.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Check, ChevronRight } from '@/components/Icons';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { ProcedureStepRow, ProcedureStepState } from './types';

/** What one card wears — resolved by the domain, never chosen here. */
export interface ProcedureCardFace {
  /** Big leading glyph. */
  Icon: ComponentType<{ className?: string }>;
  /** Icon medallion classes from the domain's hue registry. */
  medallionClass: string;
  /** Leading accent rail classes. */
  accentClass: string;
  /** Quantity ink classes. */
  quantityClass: string;
}

interface ProcedureCardsProps {
  /** Every step, in vocabulary order. Nothing is filtered out for display. */
  steps: ReadonlyArray<ProcedureStepRow>;
  /** The expanded card. `null` ⇒ every step settled. */
  activeKey: string | null;
  /** Icon + hue per step key — from the domain's face registry. */
  face: (step: ProcedureStepRow) => ProcedureCardFace;
  /** The ONE expanded body, rendered inside the active card. */
  renderActive: (step: ProcedureStepRow) => ReactNode;
  /** Jump to a card. A compact face is a button when this is supplied. */
  onSelectStep?: (key: string) => void;
  className?: string;
}

function StepStateMark({ state }: { state: ProcedureStepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  // A waiver is never a check — the glyph is the only thing carrying "we decided
  // to move past this" rather than "this happened".
  if (state === 'skipped') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-soft ring-1 ring-inset ring-border-soft">
        <ChevronRight className="h-2.5 w-2.5" />
      </span>
    );
  }
  return null;
}

export function ProcedureCards({
  steps,
  activeKey,
  face,
  renderActive,
  onSelectStep,
  className,
}: ProcedureCardsProps) {
  const railRef = useRef<HTMLOListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  // The scrollbar is hidden, so without this a wheel over the rail scrolls the
  // workbench vertically and the cards to the right are unreachable on a bench
  // with no trackpad.
  useHorizontalWheelScroll(railRef, activeKey);

  // Follow the pointer as steps complete. `block: 'nearest'` keeps the workbench
  // from scrolling vertically underneath the operator, and `.focus()` is never
  // called — the wedge owns focus.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeKey]);

  const presence = useMotionPresence(framerPresence.stationCartonSwap);
  const transition = useMotionTransition(framerTransition.stationCartonSwapMount);

  if (steps.length === 0) return null;

  return (
    <section
      className={cn(STATION_WORKBENCH_COLUMN, 'min-w-0', className)}
      aria-label="Procedure"
      data-procedure-cards
    >
      <ol
        ref={railRef}
        // `snap-x` + per-card `snap-center` is the whole travel model. No JS
        // animation, so reduced motion is the browser's problem and it gets it
        // right.
        className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step) => {
          const isActive = step.key === activeKey;
          const { Icon, medallionClass, accentClass, quantityClass } = face(step);
          const settled = step.state === 'done' || step.state === 'skipped';

          const header = (
            <div className="flex min-w-0 items-center gap-3">
              {/* Big leading glyph — the thing that identifies the card at arm's
                  length, before any text is read. */}
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center',
                  cornerClass('control'),
                  medallionClass,
                  isActive ? 'h-11 w-11' : 'h-9 w-9',
                )}
              >
                <Icon className={isActive ? 'h-5 w-5' : 'h-4 w-4'} />
              </span>

              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    'truncate text-role-caption font-semibold',
                    step.state === 'pending' || step.state === 'skipped'
                      ? 'text-text-muted'
                      : 'text-text-default',
                  )}
                >
                  {step.label}
                </span>
                {step.at ? (
                  <span className="truncate text-role-micro tabular-nums text-text-soft">
                    {step.at}
                  </span>
                ) : null}
              </span>

              {/* Quantity right, in the card's own hue. `tabular-nums` so a
                  count going 9 → 10 does not shuffle the row. */}
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {step.state === 'skipped' && step.skipReason ? (
                  <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                    {step.skipReason}
                  </span>
                ) : step.summary ? (
                  <span
                    className={cn(
                      'truncate text-role-eyebrow uppercase tracking-widest tabular-nums',
                      quantityClass,
                    )}
                  >
                    {step.summary}
                  </span>
                ) : null}
                <StepStateMark state={step.state} />
              </span>
            </div>
          );

          return (
            <li
              key={step.key}
              ref={isActive ? activeRef : undefined}
              data-procedure-step={step.key}
              data-procedure-state={step.state}
              className={cn(
                'relative flex shrink-0 snap-center flex-col overflow-hidden',
                cornerClass('card'),
                // White card on the canvas ground plane — the depth comes from
                // elevation against `background-canvas`, not from a paint fill.
                'border border-border-soft bg-surface-card',
                elevationClass('raised'),
                // Selection is fill + inset ring, never a size shift of the
                // CONTENT; the active card is wider because it hosts a body,
                // which is a different thing from a hover-grow.
                isActive
                  ? 'w-full max-w-full ring-1 ring-inset ring-blue-400'
                  : 'w-[13.5rem]',
                settled && !isActive && 'opacity-80',
              )}
            >
              {/* Leading accent rail — reads the family down the whole strip. */}
              <span
                aria-hidden
                className={cn('absolute inset-y-0 left-0 w-1', accentClass)}
              />

              {isActive ? (
                <div className="min-w-0 inset-card pl-5">
                  {header}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step.key}
                      initial={presence.initial}
                      animate={presence.animate}
                      exit={presence.exit}
                      transition={transition}
                      className="min-w-0 pt-3"
                    >
                      {renderActive(step)}
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : onSelectStep ? (
                <button
                  type="button"
                  onClick={() => onSelectStep(step.key)}
                  className={cn(
                    'ds-raw-button block w-full min-w-0 text-left inset-card pl-5',
                    focusRing('control', 'neutral'),
                  )}
                >
                  {header}
                </button>
              ) : (
                <div className="min-w-0 inset-card pl-5">{header}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
