'use client';

/**
 * The receiving record's AT-A-GLANCE head and its Fulfilment group — shared by
 * the carton record (Unboxed) and the incoming delivery record (owner
 * 2026-09-25: "triage information at a glance").
 *
 * Same grammar as the order record (owner 2026-09-28): the head is one lifted
 * card (state · count · next, then alerts); the pipeline is NOT a grid of
 * hairline cells but the Fulfilment group below the items, on the shared
 * `StepRail` — a filled node is done, the ringed node is where the record is
 * now, dashed is not yet.
 */

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Check,
  DoorOpen,
  ListChecks,
  MapPin,
  PackageOpen,
  Printer,
  Receipt,
  ShieldCheck,
  Star,
  Truck,
  Warehouse,
} from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { StepRail, type RailStep, type StepState } from '@/design-system/components/record-ledger/StepRail';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { RECORD_LABEL_CLASS, stateBadgeClass, type RecordStateFace } from '@/design-system/tokens/industrial-record';
import type {
  ReceivingStatusAlert,
  ReceivingStatusStep,
  ReceivingStepState,
} from '@/lib/receiving/receiving-status-strip';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

export function ReceivingStatusStrip({
  state,
  next,
  count,
  alerts,
  testId = 'receiving-status-strip',
}: {
  /** The overall state — the ledger row's own face, so row and record agree. */
  state: RecordStateFace;
  /** Where the record goes next (`Finish line work, then mark received.`). */
  next?: string | null;
  /** A quiet count beside the state (`3 items`). */
  count?: ReactNode;
  alerts: readonly ReceivingStatusAlert[];
  testId?: string;
}) {
  return (
    <section aria-label="Status" data-testid={testId} data-state={state.id} className={DESK_RECORD_COLUMN_CARD_CLASS}>
      <div className="flex min-h-mode-hit flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
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
                'flex items-center gap-2 border-t border-mode-fact px-4 py-1.5 text-role-data font-semibold',
                STATE_TONE_CLASSES[alert.tone].pill,
              )}
            >
              <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{alert.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Each pipeline step's glyph — the same icon-per-step grammar as the order's Fulfilment ladder. */
const STEP_ICON: Readonly<Record<string, ReactNode>> = {
  ordered: <Receipt aria-hidden />,
  tracking: <Barcode aria-hidden />,
  carrier: <Truck aria-hidden />,
  delivered: <Truck aria-hidden />,
  scanned: <DoorOpen aria-hidden />,
  staged: <MapPin aria-hidden />,
  unboxed: <PackageOpen aria-hidden />,
  contents: <ListChecks aria-hidden />,
  graded: <Star aria-hidden />,
  tested: <ShieldCheck aria-hidden />,
  labels: <Printer aria-hidden />,
  received: <Check aria-hidden />,
  putaway: <Warehouse aria-hidden />,
};

/** A step that was never stamped, but the record is past it. */
const UNSTAMPED_META: Readonly<Record<Exclude<ReceivingStepState, 'done' | 'partial'>, string>> = {
  todo: 'Not yet',
  unrecorded: 'Not recorded',
};

/**
 * The receiving pipeline as rail steps. "Now" is the first step after the
 * furthest one stamped (a partly done step is itself "now"); a skipped step
 * behind it stays dashed, never ringed.
 */
export function receivingRailSteps(steps: readonly ReceivingStatusStep[]): RailStep[] {
  const lastDone = steps.reduce((last, step, i) => (step.state === 'done' || step.state === 'partial' ? i : last), -1);
  const partialAt = steps.findIndex((step) => step.state === 'partial');
  const currentIndex = partialAt >= 0 ? partialAt : lastDone + 1;
  return steps.map((step, i): RailStep => {
    const state: StepState = step.state === 'done' ? 'done' : i === currentIndex ? 'current' : 'pending';
    const at = step.at ? formatMonthDayTimePST(step.at) : null;
    const stamped = [step.who, at].filter(Boolean).join(' · ');
    // A done step with no stamp reads its detail alone (`Ordered · 2026-09-28`), never "Done · …".
    const meta =
      step.state === 'done' || step.state === 'partial'
        ? [stamped || (step.detail ? null : step.state === 'done' ? 'Done' : 'Partly done'), step.detail].filter(Boolean).join(' · ')
        : [UNSTAMPED_META[step.state], step.detail].filter(Boolean).join(' · ');
    return {
      id: step.key,
      icon: STEP_ICON[step.key] ?? <Boxes aria-hidden />,
      state,
      title: step.label,
      meta,
      testId: `receiving-step-${step.key}`,
    };
  });
}

/** The Fulfilment group — below the items, like the order record's. */
export function ReceivingFulfilment({ steps, testId }: { steps: readonly ReceivingStatusStep[]; testId: string }) {
  if (steps.length === 0) return null;
  return (
    <RecordGroup title="Fulfilment" testId={testId}>
      <div className="px-4 py-3">
        <StepRail steps={receivingRailSteps(steps)} size="lg" label="Receiving steps" />
      </div>
    </RecordGroup>
  );
}
