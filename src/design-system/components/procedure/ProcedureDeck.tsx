'use client';

/**
 * Procedure Focus Deck — the station's WORK surface.
 *
 * Rigid flat foundation (amended 2026-08-04):
 *   • EVERY step is a full face row at a fixed 40px height (`h-10`).
 *   • Selection is outline-only — same face chrome, blue inset ring.
 *   • Active evidence mounts in a band UNDER the list (not inside the face).
 *   • No peek, no covered, no negative margins, no layout motion, no wheel.
 *
 * Host `StationWorkbench` owns scroll (`bodyAlign="end"`). This deck adds no
 * `overflow-*`, no nested scrollport, no sticky.
 *
 * ## Invariants
 *
 *   1. HIDING     → every step is mounted, from the first frame.
 *   2. RE-SORTING → strict vocabulary order. A deck is a TRANSFORM, never a
 *                   filter and never a sort.
 *   3. CONTENT    → not a viewport. Click + pager + checklist reach any step.
 *
 * Evidence band crossfades via `framerPresence.procedureFocusBody`. No
 * `layout="position"` / height FLIP on faces.
 *
 * It never takes focus — including when clicked. The caller's `onSelectStep`
 * hands focus back to the scan bar.
 */

import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { StepStateBadge } from './StepStateBadge';
import type { ProcedureStepRow } from './types';
import { PROCEDURE_STACK_GAP_REM } from './procedure-stack-layout';

/**
 * Every face — including selected — shares ONE height (28px).
 * Same visual height as `PRIMARY_CHROME_ROW_FACE` (frame chrome atom in
 * `header-shell.ts`); kept separate — procedure list faces are not frame
 * chrome shells.
 */
export const PROCEDURE_STEP_FACE_HEIGHT = 'h-7';

/** What one card wears — resolved by the domain, never chosen here. */
interface ProcedureCardFace {
  Icon: ComponentType<{ className?: string }>;
  medallionClass: string;
  surfaceClass: string;
  quantityClass: string;
}

interface ProcedureDeckProps {
  /** Every step, in vocabulary order. Nothing is filtered out for display. */
  steps: ReadonlyArray<ProcedureStepRow>;
  /** The focused card. `null` ⇒ every step settled; the deck is all history. */
  activeKey: string | null;
  /** Icon + neutral chrome per step — from the domain's face registry. */
  face: (step: ProcedureStepRow) => ProcedureCardFace;
  /**
   * The ONE body on screen — the active step's evidence, rendered in a band
   * under the list (faces stay 40px).
   */
  renderActive: (step: ProcedureStepRow) => ReactNode;
  /**
   * Jump to a card. Caller MUST hand focus back to the scan bar.
   */
  onSelectStep?: (key: string) => void;
  className?: string;
}

export function ProcedureDeck({
  steps,
  activeKey,
  face,
  renderActive,
  onSelectStep,
  className,
}: ProcedureDeckProps) {
  const activeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const el = activeRef.current;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeKey]);

  const bodyPresence = framerPresence.procedureFocusBody;
  const bodyTransition = useMotionTransition(framerTransition.procedureFocusBodyMount);

  if (steps.length === 0) return null;

  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <ol className="isolate min-w-0" aria-label="Procedure" data-procedure-deck>
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const { Icon, medallionClass, surfaceClass, quantityClass } = face(step);
          const marginStyle =
            index === 0
              ? undefined
              : ({ marginTop: `${PROCEDURE_STACK_GAP_REM}rem` } as const);

          const faceHeader = (
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center',
                  cornerClass('control'),
                  medallionClass,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <span
                className={cn(
                  'min-w-0 truncate text-role-caption font-semibold',
                  step.state === 'pending' || step.state === 'skipped'
                    ? 'text-text-muted'
                    : 'text-text-default',
                )}
              >
                {step.label}
              </span>

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
                <StepStateBadge state={step.state} variant="status" />
              </span>
            </div>
          );

          const faceInner = onSelectStep ? (
            <button
              type="button"
              onClick={() => onSelectStep(step.key)}
              className={cn(
                'ds-raw-button flex h-full w-full min-w-0 items-center text-left inset-card',
                focusRing('control', 'neutral'),
              )}
            >
              {faceHeader}
            </button>
          ) : (
            <div className="flex h-full min-w-0 items-center inset-card">{faceHeader}</div>
          );

          return (
            <li
              key={step.key}
              ref={isActive ? activeRef : undefined}
              data-procedure-step={step.key}
              data-procedure-state={step.state}
              data-procedure-zone={
                isActive
                  ? 'focus'
                  : activeIndex < 0
                    ? 'flat'
                    : index < activeIndex
                      ? 'history'
                      : 'queued'
              }
              data-procedure-mode="full"
              aria-current={isActive ? 'step' : undefined}
              style={marginStyle}
              className={cn(
                'relative flex min-w-0 flex-col',
                cornerClass('card'),
                'border',
                surfaceClass,
                PROCEDURE_STEP_FACE_HEIGHT,
                isActive && 'ring-1 ring-inset ring-blue-400',
              )}
            >
              {faceInner}
            </li>
          );
        })}
      </ol>

      {activeStep ? (
        <AnimatePresence mode="sync" initial={false}>
          <motion.section
            key={activeStep.key}
            initial={bodyPresence.initial}
            animate={bodyPresence.animate}
            exit={bodyPresence.exit}
            transition={bodyTransition}
            className={cn(
              'mt-3 min-w-0',
              cornerClass('card'),
              'border bg-surface-card px-3 py-3',
            )}
            aria-label={`${activeStep.label} — evidence`}
            data-procedure-active-body=""
          >
            {renderActive(activeStep)}
          </motion.section>
        </AnimatePresence>
      ) : null}
    </div>
  );
}
