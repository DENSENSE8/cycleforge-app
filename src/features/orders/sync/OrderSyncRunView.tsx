'use client';

/**
 * OrderSyncRunView — the order import, rendered as a measured run.
 *
 * Operator 2026-09-15: *"when I press the sync button there is no user
 * feedback … I want a step-by-step measured what's syncing to build trust."*
 * The run TAKES THE STAGE while it is in flight (`/m` gets the whole screen,
 * the desk swaps it in where the table paints) and it does not leave until the
 * operator acknowledges the result — the old 12-second toast reported a
 * minute-long batch job to an empty room.
 *
 * ## What it is made of, and what it must not be
 *
 * - **Header** is {@link StepProgressHeader} — X left, segmented bar, `n/N`
 *   right. Per its own law: do not compose a step-flow header from a title band
 *   plus an inline meter, and do not hand-roll the bar. `n` is the count of
 *   FINISHED steps (PG6), which {@link syncRunProgress} computes; it is never
 *   the index of the step in view.
 * - **Body** is the step ledger: one row per step, each carrying its own
 *   measured number. This is the trust surface — "214 rows read", "35 orders",
 *   "0 orders" — not a spinner and not a percentage.
 * - **It is NOT a table.** No `*GridRow`, no column catalog, no second grid.
 *   The desk has one
 *   table; this is a status list that stands in front of it.
 * - **One floor, and it is white.** `bg-surface-card` on the section and
 *   nothing else — the bands carry hairlines, never a second wash. This shipped
 *   briefly on `bg-surface-canvas`, which put a grey plane under the ledger
 *   (operator 2026-09-15: *"never propagate the darker gray background — always
 *   the light white background like the repair products in the kiosk page"*).
 *   Same ruling as `KIOSK_POS_CANVAS`: one SoT background, because two whites
 *   (or a white and a grey) on one screen read as a bug.
 *
 * Phone-first by construction: single column, `text-role-*` roles, touch-sized
 * controls, and no hover-only affordance — the same component serves `/m` and
 * the desk (SURFACE_LAW §3).
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { StepProgressHeader } from '@/design-system/primitives/StepProgressHeader';
import { microBadge, sectionLabel } from '@/design-system/tokens/typography/presets';
import {
  syncRunProgress,
  syncRunRowsSeen,
  syncRunSteps,
  type SyncRunOutcomeLine,
  type SyncRunState,
  type SyncRunStep,
} from '@/lib/orders-sync/run-steps';
import type { SyncRunDetail } from '@/lib/orders-sync/run-detail';
import { OrderSyncRunDetailSheet } from './OrderSyncRunDetailSheet';

export interface OrderSyncRunViewProps {
  run: SyncRunState;
  /** Wall clock the hook already owns, so the timer does not tick twice. */
  elapsedMs: number;
  isRunning: boolean;
  /** Abort the run. Header X while in flight. */
  onCancel: () => void;
  /** Acknowledge the result and give the stage back. */
  onDismiss: () => void;
  /** Roll-up sentence the hook composed for this run. */
  outcome?: SyncRunOutcomeLine | null;
  /**
   * The run's per-row record — which orders landed, which rows need a fix.
   * Opens in {@link OrderSyncRunDetailSheet} from the settled footer. Absent
   * (or empty) for a provider that reported no detail, and then no Details
   * affordance paints at all.
   */
  detail?: SyncRunDetail | null;
  /** Marks a scripted run so nobody mistakes sample numbers for real ones. */
  demo?: boolean;
  className?: string;
}

/**
 * "35 orders" / "1 order" / "0 orders". A step that finished with nothing to do
 * says zero out loud — a blank there reads as "still working".
 */
function formatCount(step: SyncRunStep): string | null {
  if (step.state === 'pending' || step.state === 'skipped') return null;
  if (step.count == null) return null;
  return `${step.count.toLocaleString()} ${step.unit}${step.count === 1 ? '' : 's'}`;
}

function StepMark({ state }: { state: SyncRunStep['state'] }) {
  if (state === 'done') {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fill-success"
        data-step-mark="done"
      >
        <Check className="h-3 w-3 text-white" aria-hidden />
      </span>
    );
  }
  if (state === 'running') {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        data-step-mark="running"
      >
        <Loader2 className="h-4 w-4 animate-spin text-fill-info" aria-hidden />
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        data-step-mark="error"
      >
        <AlertTriangle className="h-4 w-4 text-fill-danger" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center"
      data-step-mark={state}
    >
      <span className="h-2 w-2 rounded-full bg-surface-strong" />
    </span>
  );
}

export function OrderSyncRunView({
  run,
  elapsedMs,
  isRunning,
  onCancel,
  onDismiss,
  outcome,
  detail,
  demo = false,
  className = '',
}: OrderSyncRunViewProps) {
  const steps = useMemo(() => syncRunSteps(run), [run]);
  const progress = useMemo(() => syncRunProgress(run), [run]);
  const rowsSeen = syncRunRowsSeen(run);
  const visible = steps.filter((step) => step.state !== 'skipped');
  const failed = visible.some((step) => step.state === 'error');
  const [detailOpen, setDetailOpen] = useState(false);
  const detailCount = detail?.total ?? 0;

  const headline = isRunning
    ? (progress.currentLabel ?? 'Starting import…')
    : run.cancelled
      ? 'Import cancelled'
      : failed
        ? 'Import finished with problems'
        : 'Import complete';

  return (
    <section
      className={`flex min-h-0 w-full flex-1 flex-col bg-surface-card ${className}`}
      data-testid="order-sync-run"
      data-run-state={isRunning ? 'running' : 'settled'}
      aria-busy={isRunning}
    >
      <StepProgressHeader
        current={progress.completed}
        total={Math.max(progress.total, 1)}
        onClose={isRunning ? onCancel : onDismiss}
        closeLabel={isRunning ? 'Cancel import' : 'Back to orders'}
        label="Order import progress"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="flex flex-col gap-1 border-b border-border-soft px-4 py-3">
          <p className={`${microBadge} text-text-soft`}>
            {demo ? 'Order import · sample run' : 'Order import'}
          </p>
          <div className="flex items-end justify-between gap-3">
            <h2 className="min-w-0 text-role-title font-semibold text-text-default">{headline}</h2>
            <p className="shrink-0 text-role-caption font-mono tabular-nums text-text-muted">
              {(elapsedMs / 1000).toFixed(1)}s
            </p>
          </div>
          {/*
            The "how much is it importing" number the operator asked for, as
            soon as the first source read reports it — ahead of any insert.
          */}
          <p className="text-role-caption text-text-muted">
            {rowsSeen > 0
              ? `${rowsSeen.toLocaleString()} row${rowsSeen === 1 ? '' : 's'} in this run`
              : 'Reading sources…'}
          </p>
        </header>

        <ol className="flex flex-col">
          {visible.map((step) => {
            const count = formatCount(step);
            return (
              <li
                key={step.id}
                data-step={step.id}
                data-state={step.state}
                className="flex items-center gap-3 border-b border-border-hairline px-4 py-2.5"
              >
                <StepMark state={step.state} />
                <span
                  className={`min-w-0 flex-1 text-role-caption ${
                    step.state === 'pending' ? 'text-text-faint' : 'text-text-default'
                  }`}
                >
                  {step.label}
                  {step.error ? (
                    <span className="block text-role-micro text-text-danger">{step.error}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-role-caption font-mono tabular-nums text-text-muted">
                  {count ?? (step.state === 'running' ? '…' : '')}
                </span>
              </li>
            );
          })}
        </ol>

        {!isRunning && outcome ? (
          <div className="px-4 py-3">
            <p className={`${sectionLabel} mb-1`}>Result</p>
            <p
              className={`text-role-caption ${
                outcome.type === 'error' ? 'text-text-danger' : 'text-text-default'
              }`}
              data-testid="order-sync-run-outcome"
            >
              {outcome.message}
            </p>
          </div>
        ) : null}
      </div>

      {/*
        One affirmative CTA, sticky at the thumb. While the run is in flight the
        only thing to say is how far along it is — the header X is the abort.
      */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-border-soft px-4 py-3">
        {isRunning ? (
          <>
            <p className="min-w-0 flex-1 text-role-caption text-text-muted">
              Step {Math.min(progress.completed + 1, progress.total)} of {progress.total}
            </p>
            <Button variant="secondary" size="lg" onClick={onCancel}>
              Cancel import
            </Button>
          </>
        ) : (
          <>
            {detailCount > 0 ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setDetailOpen(true)}
                data-testid="order-sync-run-details"
              >
                {detail?.hasActionable ? 'Rows to fix' : 'Which rows'}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              onClick={onDismiss}
              className="flex-1"
              data-testid="order-sync-run-ack"
            >
              Back to orders
            </Button>
          </>
        )}
      </footer>

      {detail ? (
        <OrderSyncRunDetailSheet
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          detail={detail}
        />
      ) : null}
    </section>
  );
}
