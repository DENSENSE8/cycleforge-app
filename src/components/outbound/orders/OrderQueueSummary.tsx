'use client';

/** The painted queue read as the floor reads it — what needs hands: */

import { useMemo } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { daysLateOn } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LIFECYCLE, STATE_TONE_CLASSES, type LifecycleState, type StateName } from '@/design-system/tokens/lifecycle';
import { AnimatePresence, motion } from 'motion/react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, recordStateCodeClass } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { recordState } from './outbound-orders-ledger-state';

/** Summary order: the states that need hands first. */
const SUMMARY_STATES: readonly LifecycleState[] = ['outOfStock', 'urgent', 'ready', 'packed'];

interface QueueSummaryProps {
  records: readonly ShippedOrder[];
  todayKey: string;
}

/** A queue status a chip counts and filters by — a lifecycle state, or a fact (late, no bin). */
export type QueueStatusKey = LifecycleState | 'late' | 'no-bin';

/** The chip order on the triage list: the states that need hands first, then the two facts. */
export const QUEUE_STATUS_CHIPS: readonly QueueStatusKey[] = [...SUMMARY_STATES, 'late', 'no-bin'];

/** Every status one row answers to — its lifecycle state, plus late / no bin when they hold. */
export function queueRowStatusKeys(record: ShippedOrder, todayKey: string): QueueStatusKey[] {
  const keys: QueueStatusKey[] = [recordState(record)];
  const r = record as QueueRowRecord;
  const days = daysLateOn(
    todayKey,
    (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
  );
  if (days != null && days > 0) keys.push('late');
  if (!formatOutboundStoragePath(record.storage_locations)) keys.push('no-bin');
  return keys;
}

function useQueueSummary({ records, todayKey }: QueueSummaryProps) {
  return useMemo(() => {
    const counts: Record<QueueStatusKey, number> = {
      ready: 0, urgent: 0, packed: 0, outOfStock: 0, shipped: 0, onHold: 0, late: 0, 'no-bin': 0,
    };
    for (const record of records) {
      for (const key of queueRowStatusKeys(record, todayKey)) counts[key] += 1;
    }
    return { byState: counts, late: counts.late, unlocated: counts['no-bin'] };
  }, [records, todayKey]);
}

/** The empty split pane: one fact row per count. */
export function OrderQueueSummary(props: QueueSummaryProps) {
  const summary = useQueueSummary(props);
  return (
    <div className="flex flex-1 flex-col bg-mode-bar text-mode-ink" data-testid="order-queue-summary">
      <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-ink px-4 py-2 text-mode-muted')}>No order selected</p>
      <div className="flex flex-col px-4">
        {SUMMARY_STATES.map((state) => (
          <EvidenceFactRow key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(LIFECYCLE[state]))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.byState[state]}</span>
            </span>
          </EvidenceFactRow>
        ))}
        <EvidenceFactRow label="Late">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, STATE_TONE_CLASSES.danger.text)}>Past ship-by</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.late}</span>
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="No bin">
          <span className="flex items-center justify-between">
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Unassigned location</span>
            <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{summary.unlocated}</span>
          </span>
        </EvidenceFactRow>
      </div>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </div>
  );
}

/** In place: the same counts as one status-bar readout. */
export function OrderQueueSummaryLine(props: QueueSummaryProps) {
  const summary = useQueueSummary(props);
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 items-center gap-3 truncate')} data-testid="order-queue-summary-line">
      {SUMMARY_STATES.map((state) => (
        <span key={state} className={recordStateCodeClass(LIFECYCLE[state])} title={LIFECYCLE[state].label}>
          {LIFECYCLE[state].code} <span className="tabular-nums">{summary.byState[state]}</span>
        </span>
      ))}
      <span className={STATE_TONE_CLASSES.danger.text} title="Past ship-by">
        Late <span className="tabular-nums">{summary.late}</span>
      </span>
      <span className="text-mode-warn" title="Unassigned location">
        No bin <span className="tabular-nums">{summary.unlocated}</span>
      </span>
    </span>
  );
}

const CHIP_FACE: Readonly<Record<QueueStatusKey, { label: string; tone: StateName }>> = {
  ...(Object.fromEntries(
    Object.entries(LIFECYCLE).map(([state, spec]) => [state, { label: spec.label, tone: spec.tone }]),
  ) as Record<LifecycleState, { label: string; tone: StateName }>),
  late: { label: 'Late', tone: 'danger' },
  'no-bin': { label: 'No bin', tone: 'warning' },
};

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;

/**
 * Triage: the queue counts as FILTERS above the cards (owner 2026-09-27). A
 * chip counts ORDERS — a card with any line in that status — so clicking it
 * shows exactly that many cards. Several chips OR together; Reset (or Esc)
 * clears them.
 */
export function OrderQueueSummaryChips({
  orders,
  todayKey,
  active,
  onToggle,
  onReset,
}: {
  /** One entry per card: that order's lines. */
  orders: readonly (readonly ShippedOrder[])[];
  todayKey: string;
  active: ReadonlySet<QueueStatusKey>;
  onToggle: (key: QueueStatusKey) => void;
  onReset: () => void;
}) {
  const counts = useMemo(() => {
    const tally: Record<QueueStatusKey, number> = {
      ready: 0, urgent: 0, packed: 0, outOfStock: 0, shipped: 0, onHold: 0, late: 0, 'no-bin': 0,
    };
    for (const lines of orders) {
      const keys = new Set(lines.flatMap((line) => queueRowStatusKeys(line, todayKey)));
      for (const key of keys) tally[key] += 1;
    }
    return tally;
  }, [orders, todayKey]);
  return (
    <span
      role="group"
      aria-label="Filter by status"
      data-testid="order-queue-summary-chips"
      // One sideways-scrolling rail on any width (mobile first): snap per chip,
      // no scrollbar, a soft fade at the right edge says there is more.
      className="flex w-full min-w-0 snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {QUEUE_STATUS_CHIPS.map((key) => {
        const face = CHIP_FACE[key];
        const tone = STATE_TONE_CLASSES[face.tone];
        const on = active.has(key);
        const count = counts[key];
        return (
          <motion.button
            key={key}
            type="button"
            aria-pressed={on}
            data-testid={`status-filter-${key}`}
            disabled={count === 0 && !on}
            onClick={() => onToggle(key)}
            whileTap={{ scale: 0.94 }}
            layout
            transition={CHIP_SPRING}
            className={cn(
              'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
              on
                ? cn(tone.pill, tone.border, 'font-semibold shadow-elev-soft')
                : count > 0
                  ? 'border-transparent bg-surface-sunken text-text-default hover:border-border-strong'
                  : 'cursor-default border-transparent text-text-faint',
              focusRing('control'),
            )}
          >
            <motion.span
              aria-hidden
              animate={on ? { scale: [1, 1.8, 1] } : { scale: 1 }}
              transition={{ duration: 0.3 }}
              className={cn('size-1.5 rounded-full', count > 0 || on ? tone.dot : 'bg-border-default')}
            />
            {face.label}
            <span className="font-semibold tabular-nums">{count}</span>
          </motion.button>
        );
      })}
      <AnimatePresence initial={false}>
        {active.size > 0 ? (
          <motion.button
            key="reset"
            type="button"
            data-testid="status-filter-reset"
            onClick={onReset}
            initial={{ opacity: 0, scale: 0.6, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: -8 }}
            whileTap={{ scale: 0.94 }}
            transition={CHIP_SPRING}
            className={cn(
              'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full bg-text-default pl-3 pr-1.5 text-xs font-semibold text-surface-card shadow-elev-raised',
              focusRing('control'),
            )}
          >
            Reset filters
            <kbd className="rounded-[4px] bg-white/20 px-1 font-sans text-[10px] font-medium">Esc</kbd>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
