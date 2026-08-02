'use client';

/**
 * Procedure column — the station's WORK surface, as ONE vertical snap column.
 *
 * Every step of the carton's procedure, in vocabulary order, one per scroll-snap
 * viewport. The active section is expanded and carries that step's own capture
 * controls; the rest are compact faces at reduced opacity. The operator pages
 * down through the job.
 *
 * ## It was a horizontal rail until 2026-08-02
 *
 * The rail spent horizontal room to keep pending steps visible as faces to the
 * right. The column spends VERTICAL room and pages instead — affordable once the
 * label preview folded into its own step rather than sitting beneath the surface.
 *
 * The rail's docblock defended horizontality as the answer to a refused vertical
 * design. That was the wrong lesson to carry forward. What was actually refused —
 * `UnboxCaptureStack`, deleted at `33a3eb609` ("it hid pending steps and
 * re-sorted completed ones so the current card could sit at the bottom"), and the
 * **depth pile** (rows layered *behind* one another) — failed on three specific
 * counts, none of which is an axis:
 *
 *   1. HIDING     → every step here is mounted from the first frame
 *   2. RE-SORTING → strict vocabulary order, always; the active step is a snap
 *                   target wherever it falls, never moved to an end
 *   3. OCCLUSION  → flat siblings, no z-stacking, nothing behind anything
 *
 * **The ban is on occlusion, not on an axis.** Do not "restore" a z-stacked pile
 * here, and do not read this file as licence to hide a pending step.
 *
 * ## Dimming is a FOCUS channel, never a state channel
 *
 * The opacity ladder says *where the operator is*, not *what is done*. State
 * stays on {@link StepStateMark}'s glyph and the label's tone, so a colour-blind
 * or low-vision operator loses nothing — and nothing is dimmed past the
 * legibility of the evidence it carries. A dimmed section is fully present and
 * fully readable when scrolled to; that is precisely what makes dimming not
 * occlusion.
 *
 * ## Motion: native scrolling, and no layout animation at all
 *
 * Travel is CSS scroll-snap driven by the browser — not a framer transition, not
 * `layout`, not a scroll-linked timeline. That matters at scan cadence: a step
 * advances 9–24 times per carton, and a surface that reflows on its own that
 * often is the exact case the layout-animation ban exists to prevent.
 * `scrollIntoView` with `behavior: 'smooth'` degrades to an instant jump under
 * `prefers-reduced-motion` because the browser honours it natively — a cut, not
 * a crawl, which is the correct reduced form.
 *
 * Section HEIGHT changes when a step becomes active (face → active floor). That
 * is a plain reflow in one un-animated frame, and it is never animated: an
 * earlier revision of this surface sanctioned a `collapseHeight` reveal, and the
 * column retired the need for it.
 *
 * ## It never takes focus — including when clicked
 *
 * No `autoFocus`, no focus trap, no `tabIndex` on the column. The active section
 * is scrolled into view with `block: 'start'`, never `.focus()`ed.
 *
 * A face button and a neighbour chip DO natively take focus when clicked, and
 * the wedge would then type into them — so the caller's `onSelectStep` is
 * responsible for handing focus back to the scan bar. The domain adapter owns
 * that (it knows the station's event); this component stays domain-free.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from '@/components/Icons';
import { motionRole } from '@/design-system/motion/roles';
import { useMotionRole } from '@/design-system/motion/use-motion-role';
import { Button } from '@/design-system/primitives';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { ProcedureStepRow, ProcedureStepState } from './types';

/**
 * A settled or pending section — the compact face. ONE constant, so the column's
 * rhythm cannot drift per step, and so a guard can assert it.
 */
export const PROCEDURE_STEP_FACE_HEIGHT = 'h-[4.5rem]';

/**
 * The active section's FLOOR. Its body decides the rest — a step whose controls
 * are taller simply grows, in one un-animated frame.
 *
 * There are exactly TWO height constants and no third: height depends on
 * active-or-not and on nothing else. In particular it never depends on step
 * state, which is what would let a completed step quietly shrink out of the
 * record.
 */
const PROCEDURE_STEP_ACTIVE_MIN_HEIGHT = 'min-h-[12rem]';

/**
 * The focus ladder. Active full; immediate neighbours legible; beyond that
 * quiet. Never below `far` — the evidence in a settled step IS the record, and a
 * record you cannot read is not a record.
 */
const PROCEDURE_STEP_OPACITY = {
  active: 'opacity-100',
  near: 'opacity-60',
  far: 'opacity-40',
} as const;

function opacityForDistance(distance: number): string {
  if (distance <= 0) return PROCEDURE_STEP_OPACITY.active;
  return distance === 1 ? PROCEDURE_STEP_OPACITY.near : PROCEDURE_STEP_OPACITY.far;
}

/** What one section wears — resolved by the domain, never chosen here. */
interface ProcedureCardFace {
  /** Big leading glyph. */
  Icon: ComponentType<{ className?: string }>;
  /** Icon medallion classes from the domain's hue registry. */
  medallionClass: string;
  /** Leading accent rail classes. */
  accentClass: string;
  /** Quantity ink classes. */
  quantityClass: string;
}

interface ProcedureColumnProps {
  /** Every step, in vocabulary order. Nothing is filtered out for display. */
  steps: ReadonlyArray<ProcedureStepRow>;
  /** The expanded section. `null` ⇒ every step settled. */
  activeKey: string | null;
  /**
   * The column section before/after the active one, in vocabulary order —
   * whatever its state. NOT the skip target: a chip wired to that would page the
   * operator past a settled step they can still reopen.
   */
  prevKey?: string | null;
  nextKey?: string | null;
  /** Icon + hue per step key — from the domain's face registry. */
  face: (step: ProcedureStepRow) => ProcedureCardFace;
  /** The ONE expanded body, rendered inside the active section. */
  renderActive: (step: ProcedureStepRow) => ReactNode;
  /**
   * Jump to a section. A face is a button when this is supplied.
   *
   * The caller MUST hand focus back to the scan bar — a clicked button holds
   * focus, and the next wedge scan would type into it.
   */
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

export function ProcedureColumn({
  steps,
  activeKey,
  prevKey,
  nextKey,
  face,
  renderActive,
  onSelectStep,
  className,
}: ProcedureColumnProps) {
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Follow the pointer as steps complete — including after a scan lands its
  // evidence. `block: 'start'` aligns to the snap edge; `'nearest'` (the rail's
  // rule) can park a section straddling two snap positions. `.focus()` is never
  // called — the wedge owns focus.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeKey]);

  const { presence, transition } = useMotionRole(motionRole.swap.scan);

  if (steps.length === 0) return null;

  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;
  const prev = prevKey ? (steps.find((step) => step.key === prevKey) ?? null) : null;
  const next = nextKey ? (steps.find((step) => step.key === nextKey) ?? null) : null;

  return (
    <section
      className={cn(STATION_WORKBENCH_COLUMN, 'flex min-h-0 min-w-0 flex-col', className)}
      aria-label="Procedure"
      data-procedure-column
    >
      <ol
        // `snap-y` + per-section `snap-start` is the whole travel model. No JS
        // animation, so reduced motion is the browser's problem and it gets it
        // right. ONE scroll port: no section owns a nested scroller.
        className="min-w-0 flex-1 space-y-3 snap-y snap-mandatory overflow-y-auto overscroll-contain pb-2"
      >
        {steps.map((step, index) => {
          const isActive = step.key === activeKey;
          const { Icon, medallionClass, accentClass, quantityClass } = face(step);
          // Distance from the pointer drives OPACITY ONLY. With no active step
          // (a settled carton) nothing is dimmed — there is no "here" to be
          // away from.
          const distance = activeIndex < 0 ? 0 : Math.abs(index - activeIndex);

          const header = (
            <div className="flex min-w-0 items-center gap-3">
              {/* Big leading glyph — the thing that identifies the section at
                  arm's length, before any text is read. */}
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

              {/* Quantity right, in the section's own hue. `tabular-nums` so a
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
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'relative flex snap-start snap-always flex-col',
                cornerClass('card'),
                // White card on the canvas ground plane — the depth comes from
                // elevation against `background-canvas`, not from a paint fill.
                'border border-border-soft bg-surface-card',
                elevationClass('raised'),
                // TWO heights, no third, and neither is animated.
                isActive
                  ? cn(PROCEDURE_STEP_ACTIVE_MIN_HEIGHT, 'ring-1 ring-inset ring-blue-400')
                  : PROCEDURE_STEP_FACE_HEIGHT,
                opacityForDistance(distance),
                // CSS, not framer: this fires on every step advance across every
                // mounted section, and a re-render per section to move an alpha
                // the compositor gives away free is the trade this avoids.
                'motion-safe:transition-opacity motion-safe:duration-200',
              )}
            >
              {/* Leading accent rail — left corners match the card role without
                  `overflow-hidden`, which would shear focus rings off inputs. */}
              <span
                aria-hidden
                className={cn('absolute inset-y-0 left-0 w-1 rounded-l-2xl', accentClass)}
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
                    'ds-raw-button flex h-full w-full min-w-0 items-center text-left inset-card pl-5',
                    focusRing('control', 'neutral'),
                  )}
                >
                  {header}
                </button>
              ) : (
                <div className="flex h-full min-w-0 items-center inset-card pl-5">{header}</div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Column neighbours. Real vocabulary labels, so the operator knows what
          is coming without scrolling; omitted at the ends rather than shipped
          disabled with a dead label. Neither is `primary` — the dock's terminal
          owns that rank. */}
      {onSelectStep && (prev || next) ? (
        <nav
          aria-label="Procedure steps"
          className="flex shrink-0 items-center gap-2 pt-3"
        >
          {prev ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft className="h-3.5 w-3.5" />}
              onClick={() => onSelectStep(prev.key)}
            >
              {prev.label}
            </Button>
          ) : null}
          {next ? (
            <Button
              className="ml-auto"
              variant="secondary"
              size="sm"
              onClick={() => onSelectStep(next.key)}
            >
              <span className="flex items-center gap-1.5">
                {next.label}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
