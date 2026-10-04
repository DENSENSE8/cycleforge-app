'use client';

/**
 * MobileStepProgress — the phone's step-by-step bar for a multi-step flow
 * (owner 2026-10-03: importing orders must show where you are and what is
 * left, at the top).
 *
 *   ▬▬▬▬ ▬▬▬▬ ▬▬▬▬ ▭▭▭▭
 *   Step 3 of 4 · Review orders
 *
 * One full-width segment per step: done (success fill), current (info fill),
 * ahead (empty track) — the ProgressDots palette. Only a COMPLETED segment is
 * pressable, and only when `onStepPress` is given: it jumps back to fix that
 * step; nothing jumps forward past an unfinished step. Each segment owns the
 * full 44px row as its hit area (TAP_MIN_H_CLASS) while the bar it paints
 * stays thin. Fills are a scaleX transform gated by useReducedMotion — the
 * ProgressBar motion law (M1), never a width tween.
 *
 * STACKING (V2 scroll law, docs/mobile-first/V2_ARCHITECTURE.md): the bar is
 * IN FLOW. MobileV2Shell owns the only scroll container; the bar heads the
 * step's content and scrolls with it. The step's one primary verb lives in
 * DetailDock, which persists, so nothing needed to act leaves with the bar.
 * It adds no sticky band and no z-index of its own.
 */

import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, motionDuration } from '@/design-system/foundations/motion-presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { TAP_MIN_H_CLASS } from '@/design-system/tokens/interaction';
import { cn } from '@/utils/_cn';
import { mobileStepCaption, mobileStepViews, type MobileStepState } from './mobile-step-progress-model';

export interface MobileStepProgressStep {
  id: string;
  label: string;
}

export interface MobileStepProgressProps {
  /** 2..6 steps, in order. */
  steps: readonly MobileStepProgressStep[];
  currentIndex: number;
  /** Only completed steps (index < currentIndex) are pressable — jump back. */
  onStepPress?: (index: number) => void;
  testId?: string;
}

const FILL_CLASS: Readonly<Record<MobileStepState, string>> = {
  done: 'bg-fill-success',
  current: 'bg-fill-info',
  todo: 'bg-fill-info',
};

const STATE_WORD: Readonly<Record<MobileStepState, string>> = {
  done: 'done',
  current: 'current step',
  todo: 'not started',
};

function SegmentBar({ state, instant }: { state: MobileStepState; instant: boolean }) {
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
      <motion.span
        initial={false}
        animate={{ scaleX: state === 'todo' ? 0 : 1 }}
        transition={instant ? { duration: 0 } : { duration: motionDuration.progressFill, ease: motionBezier.easeOut }}
        className={cn('block h-full w-full origin-left rounded-full', FILL_CLASS[state])}
      />
    </span>
  );
}

export function MobileStepProgress({ steps, currentIndex, onStepPress, testId }: MobileStepProgressProps) {
  const instant = useReducedMotion() ?? false;
  const views = mobileStepViews(steps.length, currentIndex, Boolean(onStepPress));
  const caption = mobileStepCaption(
    steps.map((step) => step.label),
    currentIndex,
  );
  if (steps.length === 0) return null;

  return (
    <nav aria-label="Steps" data-testid={testId} className="bg-surface-card px-mode-page pb-2">
      <ol className="flex items-center gap-1">
        {steps.map((step, index) => {
          const view = views[index];
          const srLabel = `Step ${index + 1}, ${step.label}: ${STATE_WORD[view.state]}`;
          return (
            <li
              key={step.id}
              aria-current={view.state === 'current' ? 'step' : undefined}
              data-step-state={view.state}
              className="min-w-0 flex-1"
            >
              {view.pressable ? (
                <button
                  type="button"
                  aria-label={`Back to step ${index + 1}, ${step.label}`}
                  data-testid={testId ? `${testId}-step-${index}` : undefined}
                  onClick={() => onStepPress?.(index)}
                  className={cn(
                    'ds-raw-button flex w-full touch-manipulation items-center rounded-md',
                    TAP_MIN_H_CLASS,
                    focusRing('control'),
                  )}
                >
                  <SegmentBar state={view.state} instant={instant} />
                </button>
              ) : (
                <span className={cn('flex w-full items-center', TAP_MIN_H_CLASS)}>
                  <span className="sr-only">{srLabel}</span>
                  <SegmentBar state={view.state} instant={instant} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p data-testid={testId ? `${testId}-caption` : undefined} className="break-words text-role-caption text-text-muted">
        {caption}
      </p>
    </nav>
  );
}
