import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';

/**
 * The rail grammar a record reads its history and its progress on (owner
 * 2026-09-27): an icon node per step, joined by ONE vertical hairline. The
 * Fulfilment ladder (Picked → QC → Packed → Scanned out) and the Timeline
 * (`EventTimeline`) draw on these same tokens so the two read as one system.
 *
 * Two looks, one component: nodes take `rounded-mode-pill` (round in triage,
 * follows `rounded-mode-pill`); the hairline is `bg-mode-divide`. A step's state is
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
  /** Semantic identity for this workflow stage. */
  tone?: StateName;
  /** First line — what happened / the step's name. */
  title: ReactNode;
  /** Second line — who · when (or "Not yet"). */
  meta?: ReactNode;
  /** Read-only evidence that remains visible after the step is complete (serial, station …). */
  detail?: ReactNode;
  /** The step's one action (assign …), right-aligned on the title line. */
  action?: ReactNode;
  /** Details that belong to this step (bins under Picked, bench under Packed). */
  children?: ReactNode;
  testId?: string;
}

function stepNodeStateClass(step: Pick<RailStep, 'state' | 'tone'>): string {
  if (!step.tone) return STEP_NODE_STATE_CLASS[step.state];
  const tone = STATE_TONE_CLASSES[step.tone];
  if (step.state === 'done') return cn('border border-transparent text-mode-bar', tone.dot);
  if (step.state === 'current') return cn('border-2', tone.border, tone.pill);
  return cn('border border-dashed bg-mode-bar', tone.border, tone.text);
}

export function StepRail({
  steps,
  size = 'lg',
  label,
  className,
  orientation = 'vertical',
  horizontalScroll = false,
  connectors = true,
}: {
  steps: readonly RailStep[];
  size?: StepRailSize;
  /** Accessible name for the list. */
  label: string;
  className?: string;
  /** Horizontal is the compact process face used above Allocate's items. */
  orientation?: 'vertical' | 'horizontal';
  /** Keep every horizontal step on one rail and let its owner scroll it. */
  horizontalScroll?: boolean;
  /** Draw the process connector. Dense status summaries can use independent nodes. */
  connectors?: boolean;
}) {
  const lastDone = steps.length - 1;
  if (orientation === 'horizontal') {
    return (
      <ol
        aria-label={label}
        className={cn(
          horizontalScroll
            ? 'flex min-w-max items-stretch'
            : // The record body is a size container. A narrow split pane gets
              // two readable rows; the full record keeps the intended
              // left-to-right process strip. Never squeeze four names/actions
              // into 80px cells.
              'grid min-w-0 grid-cols-1 items-stretch @xs:grid-cols-2 @md:grid-cols-4',
          className,
        )}
      >
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={cn(
              'relative min-w-0 py-3',
              horizontalScroll
                ? 'w-56 shrink-0 pr-5 last:pr-0'
                : 'px-0 @xs:px-2.5 @xs:odd:pl-0 @xs:even:pr-0 @md:px-3 @md:first:pl-0 @md:last:pr-0',
            )}
            data-testid={step.testId}
            data-step-state={step.state}
            data-step-tone={step.tone}
          >
            {connectors && i < lastDone ? (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-3.5 top-6 h-px bg-mode-divide',
                  // At two columns, stop the connector at the row edge. Once
                  // wide, every step joins the next one in one horizontal run.
                  horizontalScroll
                    ? 'right-0'
                    : i % 2 === 0
                      ? 'hidden @xs:block @xs:right-[-0.625rem]'
                      : 'hidden @md:block @md:right-[-0.75rem]',
                )}
              />
            ) : null}
            <div className="relative z-[1] flex min-w-0 items-start gap-3 bg-mode-bar">
              <span aria-hidden className={cn(STEP_RAIL_NODE_CLASS, STEP_RAIL_NODE_SIZE[size], stepNodeStateClass(step))}>
                {step.icon}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-role-body font-bold',
                      step.tone ? STATE_TONE_CLASSES[step.tone].text : step.state === 'pending' ? 'text-mode-muted' : 'text-mode-ink',
                    )}
                  >
                    {step.title}
                  </span>
                  {step.action ? <span className="flex shrink-0 items-center">{step.action}</span> : null}
                </div>
                {step.meta ? <div className="mt-0.5 whitespace-normal text-role-caption font-medium leading-snug text-mode-muted">{step.meta}</div> : null}
                {step.detail ? <div className="mt-1 min-w-0 text-role-caption leading-snug text-mode-ink">{step.detail}</div> : null}
              </div>
            </div>
            {step.children && step.state === 'current' ? (
              <div className="mt-3 flex min-w-0 flex-col gap-1 pl-10">{step.children}</div>
            ) : null}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol aria-label={label} className={cn('relative flex flex-col', className)}>
      {steps.map((step, i) => (
        <li
          key={step.id}
          className="relative flex gap-3 pb-3 last:pb-0"
          data-testid={step.testId}
          data-step-state={step.state}
          data-step-tone={step.tone}
        >
          {i < lastDone ? (
            <span aria-hidden className={cn(STEP_RAIL_LINE_CLASS, STEP_RAIL_LINE_LEFT[size], 'top-0 bottom-0')} />
          ) : null}
          <span aria-hidden className={cn(STEP_RAIL_NODE_CLASS, STEP_RAIL_NODE_SIZE[size], stepNodeStateClass(step))}>
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
            {step.detail ? <div className="mt-1 min-w-0 text-role-caption leading-snug text-mode-ink">{step.detail}</div> : null}
            {step.children ? <div className="mt-1 flex min-w-0 flex-col gap-1">{step.children}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
