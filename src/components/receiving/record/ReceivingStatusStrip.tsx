'use client';

/**
 * The receiving record's AT-A-GLANCE head — the first thing a staffer reads on
 * a carton or incoming delivery record (owner 2026-09-25: "triage information
 */

import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Check, CircleDot, Minus } from '@/components/Icons';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  stateBadgeClass,
  type RecordStateFace,
} from '@/design-system/tokens/industrial-record';
import type {
  ReceivingStatusAlert,
  ReceivingStatusStep,
  ReceivingStepState,
} from '@/lib/receiving/receiving-status-strip';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

/** Each step state's glyph (shape is the second carrier after colour) and spoken word. */
const STEP_FACE: Readonly<
  Record<ReceivingStepState, { Glyph: ComponentType<{ className?: string }> | null; word: string; className: string }>
> = {
  done: { Glyph: Check, word: 'Done', className: STATE_TONE_CLASSES.success.text },
  partial: { Glyph: CircleDot, word: 'Partly done', className: STATE_TONE_CLASSES.warning.text },
  todo: { Glyph: null, word: 'Not yet', className: 'text-mode-muted' },
  unrecorded: { Glyph: Minus, word: 'Not recorded', className: 'text-mode-muted' },
};

export function ReceivingStatusStrip({
  state,
  next,
  count,
  steps,
  alerts,
  testId = 'receiving-status-strip',
}: {
  /** The overall state — the ledger row's own face, so row and record agree. */
  state: RecordStateFace;
  /** Where the record goes next (`Finish line work, then mark received.`). */
  next?: string | null;
  /** A quiet count beside the state (`3 items`). */
  count?: ReactNode;
  steps: readonly ReceivingStatusStep[];
  alerts: readonly ReceivingStatusAlert[];
  testId?: string;
}) {
  return (
    <section
      aria-label="Status"
      data-testid={testId}
      data-state={state.id}
      className="flex flex-col border border-mode-ink bg-mode-bar"
    >
      <div className="flex min-h-mode-hit flex-wrap items-center gap-x-3 gap-y-1 border-b border-mode-ink px-4 py-2">
        <span className={cn(RECORD_LABEL_CLASS, 'inline-flex items-center', stateBadgeClass(state.tone))} data-testid={`${testId}-state`}>
          {state.code} · {state.label}
        </span>
        {count ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{count}</span> : null}
        {next ? (
          <span className={cn(RECORD_LABEL_CLASS, 'ml-auto text-mode-ink')} data-testid={`${testId}-next`}>
            → {next}
          </span>
        ) : null}
      </div>
      {alerts.length > 0 ? (
        <ul aria-label="Alerts" className="flex flex-col">
          {alerts.map((alert) => (
            <li
              key={alert.key}
              role="alert"
              data-alert={alert.key}
              className={cn(
                'flex items-center gap-2 border-b border-mode-ink px-4 py-1.5 text-role-data font-bold',
                STATE_TONE_CLASSES[alert.tone].pill,
              )}
            >
              <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{alert.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ol aria-label="Pipeline" className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-5">
        {steps.map((step) => {
          const face = STEP_FACE[step.state];
          const at = step.at ? formatMonthDayTimePST(step.at) : null;
          return (
            <li
              key={step.key}
              data-step={step.key}
              data-step-state={step.state}
              className="flex min-w-0 flex-col gap-0.5 border-b border-r border-mode-rule px-3 py-2"
            >
              <span className={cn(RECORD_LABEL_CLASS, 'flex items-center gap-1.5', face.className)}>
                {face.Glyph ? (
                  <face.Glyph aria-hidden className="h-3 w-3 shrink-0" />
                ) : (
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-current" />
                )}
                <span className="truncate text-mode-ink">{step.label}</span>
                <span className="sr-only">{face.word}</span>
                {step.detail ? <span className="ml-auto shrink-0 normal-case tracking-normal">{step.detail}</span> : null}
              </span>
              <span className={cn('truncate text-role-caption', step.who ? 'text-mode-ink' : 'text-mode-muted')} title={step.who ?? undefined}>
                {step.who ?? (step.state === 'todo' || step.state === 'unrecorded' ? face.word : '\u00a0')}
              </span>
              <span className={cn(RECORD_ID_CLASS, 'truncate font-normal text-mode-muted')}>{at ?? '\u00a0'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
