'use client';

/**
 * Procedure stack — the interactive, bottom-anchored work surface for a
 * station's steps.
 *
 * A SIBLING of {@link ProcedureChecklist}, not a replacement. The checklist is a
 * read-only list any station can mount in a reference column; the stack is the
 * thing the operator works in, sitting directly above the composer dock. Two
 * jobs, one row vocabulary (`./types`) — which is the shape the house rules ask
 * for when a new job appears, rather than a second declaration of what a step is.
 *
 * ## It is a FLAT LEDGER. Read this before "improving" the geometry.
 *
 * Every step is a row, in vocabulary order: done, skipped, and pending collapse
 * to one line; the active one expands to a single card. **Nothing overlaps and
 * nothing is hidden.**
 *
 * The Apple-Watch-style depth pile was asked for, evaluated, and refused. It
 * compresses because a 1.9-inch viewport cannot show two things; a 720px column
 * shows all nine steps with room to spare, so the pile solves a constraint this
 * surface does not have, and it costs what compression always costs —
 * occlusion — of the right-aligned completion times that are the entire point of
 * the record. Piling *upcoming* steps is verbatim the diagnosis that killed the
 * first attempt at this surface: hiding the pending steps so the operator cannot
 * see the shape of the work before they are in it. Re-adding a layered stack
 * reverts a decision; it does not fill a gap.
 *
 * ## Motion: opacity only, and the layout SNAPS
 *
 * The active card crossfades its CONTENTS on `activeKey` with the station-cadence
 * preset (`stationCartonSwap`), never the pointer-driven pane preset — step
 * advance fires 9–24 times per carton at scan cadence, which is precisely the
 * "reflows on its own" case the layout-animation ban names. Row positions and
 * the card's height change in one un-animated frame. There is no `layout` prop
 * on the container and there must not be one: at a bench, motion is latency.
 *
 * No scroll-linked animation either (`animation-timeline`, `useScroll`) — a
 * scanner-driven operator does not scroll this list, so it would decorate a path
 * nobody takes.
 *
 * ## It never takes focus
 *
 * No `autoFocus`, no focus trap, no `tabIndex` on the container. The scan bar
 * owns focus, and a step card that steals it drops scans silently — the failure
 * mode is invisible, which is what makes it expensive. That invariant is pinned
 * by a Playwright row, not by this comment.
 *
 * ## Presentational only
 *
 * No fetch, no domain import, no photo stage. Everything arrives as props; the
 * station's adapter is the only module that knows both the domain and this
 * component.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import type { ReactNode } from 'react';
import { Check, ChevronRight } from '@/components/Icons';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { ProcedureStepRow, ProcedureStepState } from './types';

interface ProcedureStackProps {
  /** Every step, in vocabulary order. Nothing is filtered out for display. */
  steps: ReadonlyArray<ProcedureStepRow>;
  /**
   * The expanded step, resolved by `resolveActiveStep`. `null` ⇒ every step is
   * settled; the stack renders as a flat settled ledger and the caller decides
   * whether a receipt takes the surface.
   */
  activeKey: string | null;
  /** The step a skip advances TO — named on the peek. Null ⇒ skipping settles. */
  nextStep?: ProcedureStepRow | null;
  /** The ONE expanded body. */
  renderActive: (step: ProcedureStepRow) => ReactNode;
  /** Override the collapsed row. Default: marker · label · detail · time. */
  renderDoneRow?: (step: ProcedureStepRow) => ReactNode;
  /**
   * Waive the active step. Omit when the step declares `skip: false` — the
   * control is then not rendered at all, rather than rendered disabled: a
   * visible affordance for something that can never happen is worse than none.
   */
  onSkip?: (key: string) => void;
  /** Re-enter a settled (done OR skipped) row. Omit for a read-only stack. */
  onReopen?: (key: string) => void;
  /** The frame's left anchor — the time. */
  headerStart?: ReactNode;
  /**
   * The frame's declared right anchor. **Ships empty**, deliberately: the only
   * honest number this surface has is carton-open → received, which is not final
   * until the carton closes — at which point the receipt owns it. Filling this
   * with a live elapsed clock was refused (on a bench it reads as pressure, not
   * information), and a step counter or a percentage duplicates the visible rows
   * against a denominator that moves on a per-unit carton.
   */
  headerEnd?: ReactNode;
  className?: string;
}

function StepMarker({ state, position }: { state: ProcedureStepState; position: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  // Never a check. A waiver is a decision to move past, not evidence of work,
  // and this glyph is the only thing carrying that difference in the row.
  if (state === 'skipped') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-soft ring-1 ring-inset ring-border-soft">
        <ChevronRight className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-card text-role-micro font-semibold text-blue-700 ring-2 ring-blue-500">
        {position}
      </span>
    );
  }
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong ring-1 ring-inset ring-border-soft"
      aria-hidden
    />
  );
}

/** Collapsed row: marker · label · what happened · when. One line, constant height. */
function CollapsedRow({ step }: { step: ProcedureStepRow }) {
  const settled = step.state === 'done' || step.state === 'skipped';
  const trailing =
    step.state === 'skipped'
      ? step.skipReason
        ? `Skipped · ${step.skipReason}`
        : 'Skipped'
      : step.summary;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <StepMarker state={step.state} position={step.position} />
      <span
        className={cn(
          'truncate text-role-caption font-semibold',
          settled && step.state === 'done' ? 'text-text-default' : 'text-text-muted',
        )}
      >
        {step.label}
      </span>
      {trailing ? (
        <span className="ml-auto truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
          {trailing}
        </span>
      ) : null}
      {step.at ? (
        <span
          className={cn(
            'shrink-0 text-role-micro tabular-nums text-text-soft',
            trailing ? 'pl-2' : 'ml-auto',
          )}
        >
          {step.at}
        </span>
      ) : null}
    </div>
  );
}

export function ProcedureStack({
  steps,
  activeKey,
  nextStep = null,
  renderActive,
  renderDoneRow,
  onSkip,
  onReopen,
  headerStart,
  headerEnd,
  className,
}: ProcedureStackProps) {
  // Opacity-only, station cadence. `useMotionPresence` returns a plain opacity
  // shape under reduced motion and `useMotionTransition` zeroes the duration, so
  // the hard cut everyone gets there is the same behaviour, just faster.
  const presence = useMotionPresence(framerPresence.stationCartonSwap);
  const transition = useMotionTransition(framerTransition.stationCartonSwapMount);

  if (steps.length === 0) return null;

  const active = activeKey ? steps.find((step) => step.key === activeKey) ?? null : null;

  return (
    <section
      className={cn(STATION_WORKBENCH_COLUMN, 'flex min-w-0 flex-col', className)}
      aria-label="Procedure"
      data-procedure-stack
    >
      <div className="flex min-w-0 items-center justify-between gap-2 pb-1">
        <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
          {headerStart}
        </span>
        {/* Declared right anchor. Empty by ruling — see `headerEnd` above. */}
        <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-text-soft">
          {headerEnd}
        </span>
      </div>

      <ol className="flex min-w-0 flex-col gap-1">
        {steps.map((step) => {
          const isActive = step.key === active?.key;
          const settled = step.state === 'done' || step.state === 'skipped';

          if (isActive) {
            return (
              <li
                key={step.key}
                data-procedure-step={step.key}
                data-procedure-state="active"
                className={cn(
                  cornerClass('card'),
                  'min-w-0 border border-border-soft bg-surface-card inset-card',
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <StepMarker state="active" position={step.position} />
                    <span className="truncate text-role-caption font-semibold text-text-default">
                      {step.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {step.summary ? (
                      <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                        {step.summary}
                      </span>
                    ) : null}
                    {/* The peek NAMES its destination — a bare "Skip" makes the
                        operator guess where they land, and seeing the next step
                        is the whole point. It lives here, on the card, and never
                        beside the dock's primary, where muscle memory would
                        press it. */}
                    {onSkip ? (
                      <button
                        type="button"
                        onClick={() => onSkip(step.key)}
                        data-procedure-skip={step.key}
                        className={cn(
                          'ds-raw-button shrink-0 truncate text-role-eyebrow uppercase tracking-widest text-text-soft hover:text-text-default',
                          focusRing('control', 'neutral'),
                        )}
                      >
                        Looks good → {nextStep ? nextStep.label : 'Done'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Crossfade the CONTENTS, not the frame. `mode="wait"` because
                    two concurrent semi-transparent bodies double-image. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step.key}
                    initial={presence.initial}
                    animate={presence.animate}
                    exit={presence.exit}
                    transition={transition}
                    className="min-w-0 pt-2"
                  >
                    {renderActive(step)}
                  </motion.div>
                </AnimatePresence>
              </li>
            );
          }

          const row = renderDoneRow ? renderDoneRow(step) : <CollapsedRow step={step} />;

          return (
            <li
              key={step.key}
              data-procedure-step={step.key}
              data-procedure-state={step.state}
              className={cn(cornerClass('row'), 'inset-cozy min-w-0')}
            >
              {/* A settled row is re-enterable — that IS the reopen affordance,
                  and it is why a skip is never a dead end. */}
              {settled && onReopen ? (
                <button
                  type="button"
                  onClick={() => onReopen(step.key)}
                  className={cn(
                    'ds-raw-button block w-full min-w-0 text-left',
                    focusRing('control', 'neutral'),
                  )}
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
