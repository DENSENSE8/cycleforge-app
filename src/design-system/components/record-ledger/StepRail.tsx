import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/**
 * The rail grammar a record reads its history and its progress on (owner
 * 2026-09-27): an icon node per step, joined by ONE vertical hairline. The
 * Fulfilment ladder (Picked → QC → Packed → Scanned out) and the Timeline
 * (`EventTimeline`) draw on these same tokens so the two read as one system.
 *
 * Two looks, one component: nodes take `rounded-mode-pill` (round in triage,
 * square on industrial); the hairline is `bg-mode-divide`. A step's state is
 * colour only — a live update fills the node, it never moves the row.
 */

export type StepState = 'done' | 'current' | 'pending';

export type StepRailSize = 'md' | 'lg';

/** Node box per size — `md` is the Timeline's 16px glyph, `lg` the Fulfilment ladder's 28px. */
export const STEP_RAIL_NODE_SIZE: Readonly<Record<StepRailSize, string>> = {
  md: 'size-4 [&_svg]:size-3',
  lg: 'size-7 [&_svg]:size-3.5',
};

/** Left offset of the hairline — the node's centre on the rail's x. */
export const STEP_RAIL_LINE_LEFT: Readonly<Record<StepRailSize, string>> = {
  md: 'left-2',
  lg: 'left-3.5',
};

/** The rail's hairline (one per rail, behind the nodes). */
export const STEP_RAIL_LINE_CLASS = 'pointer-events-none absolute w-px bg-mode-divide';

/** A node's face per state — fill says done, ring says now, dashes say not yet. */
export const STEP_NODE_STATE_CLASS: Readonly<Record<StepState, string>> = {
  done: 'border border-transparent bg-mode-ink text-mode-bar',
  current: 'border-2 border-mode-ink bg-mode-bar text-mode-ink',
  pending: 'border border-dashed border-mode-edge bg-mode-bar text-mode-muted',
};

/** The node box itself (state + size appended). */
export const STEP_RAIL_NODE_CLASS =
  'relative z-[1] flex shrink-0 items-center justify-center rounded-mode-pill transition-colors';

export interface RailStep {
  id: string;
  icon: ReactNode;
  state: StepState;
  /** First line — what happened / the step's name. */
  title: ReactNode;
  /** Second line — who · when (or "Not yet"). */
  meta?: ReactNode;
  /** The step's one action (assign …), right-aligned on the title line. */
  action?: ReactNode;
  /** Details that belong to this step (bins under Picked, bench under Packed). */
  children?: ReactNode;
  testId?: string;
}

export function StepRail({
  steps,
  size = 'lg',
  label,
  className,
}: {
  steps: readonly RailStep[];
  size?: StepRailSize;
  /** Accessible name for the list. */
  label: string;
  className?: string;
}) {
  const lastDone = steps.length - 1;
  return (
    <ol aria-label={label} className={cn('relative flex flex-col', className)}>
      {steps.map((step, i) => (
        <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0" data-testid={step.testId} data-step-state={step.state}>
          {i < lastDone ? (
            <span aria-hidden className={cn(STEP_RAIL_LINE_CLASS, STEP_RAIL_LINE_LEFT[size], 'top-0 bottom-0')} />
          ) : null}
          <span aria-hidden className={cn(STEP_RAIL_NODE_CLASS, STEP_RAIL_NODE_SIZE[size], STEP_NODE_STATE_CLASS[step.state])}>
            {step.icon}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className={cn('flex min-w-0 items-center gap-2', size === 'lg' ? 'min-h-7' : 'min-h-4')}>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-role-body',
                  step.state === 'pending' ? 'font-medium text-mode-muted' : 'font-semibold text-mode-ink',
                )}
              >
                {step.title}
              </span>
              {step.action ? <span className="flex shrink-0 items-center">{step.action}</span> : null}
            </div>
            {step.meta ? <div className="min-w-0 text-role-caption text-mode-muted">{step.meta}</div> : null}
            {step.children ? <div className="mt-1 flex min-w-0 flex-col gap-1">{step.children}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
