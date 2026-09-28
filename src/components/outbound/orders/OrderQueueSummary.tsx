'use client';

/**
 * The painted queue read as the floor reads it — ORDER STATUS only (owner
 * 2026-09-28): Urgent · To pick · Picked · Packed · Out of stock. Late reads
 * off the card's ship-by corner and the Late section; No bin was dropped
 * (measured: it held for 173 of 173 orders — nothing is allocated, so it
 * carried no information).
 */

import { useMemo, useRef } from 'react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LIFECYCLE, LIFECYCLE_STATES, STATE_TONE_CLASSES, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { AnimatePresence, motion } from 'motion/react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, recordStateCodeClass } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { recordState } from './outbound-orders-ledger-state';

/**
 * The statuses the desk counts and filters by (owner 2026-09-28): Urgent first,
 * then the floor walk To pick → Picked → Packed, Out of stock last. Every order
 * answers to one.
 */
export const QUEUE_STATUS_CHIPS: readonly LifecycleState[] = ['urgent', 'toPick', 'picked', 'packed', 'outOfStock'];

/** The status one row answers to — for the triage cut's `rowStatusKeys`. */
export function queueRowStatusKeys(record: ShippedOrder): LifecycleState[] {
  return [recordState(record)];
}

/** A zero for every lifecycle state. */
function emptyQueueCounts(): Record<LifecycleState, number> {
  return Object.fromEntries(LIFECYCLE_STATES.map((state) => [state, 0])) as Record<LifecycleState, number>;
}

function useQueueCounts(records: readonly ShippedOrder[]): Record<LifecycleState, number> {
  return useMemo(() => {
    const counts = emptyQueueCounts();
    for (const record of records) counts[recordState(record)] += 1;
    return counts;
  }, [records]);
}

/** The empty split pane: one fact row per status. */
export function OrderQueueSummary({ records }: { records: readonly ShippedOrder[] }) {
  const counts = useQueueCounts(records);
  return (
    <div className="flex flex-1 flex-col bg-mode-bar text-mode-ink" data-testid="order-queue-summary">
      <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-ink px-4 py-2 text-mode-muted')}>No order selected</p>
      <div className="flex flex-col px-4">
        {QUEUE_STATUS_CHIPS.map((state) => (
          <EvidenceFactRow key={state} label={LIFECYCLE[state].code}>
            <span className="flex items-center justify-between">
              <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(LIFECYCLE[state]))}>{LIFECYCLE[state].label}</span>
              <span className={cn(RECORD_ID_CLASS, 'tabular-nums')}>{counts[state]}</span>
            </span>
          </EvidenceFactRow>
        ))}
      </div>
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-edge p-4 text-mode-muted')}>
        Open a record · J / K to step · Esc to close
      </p>
    </div>
  );
}

/** In place: the same counts as one status-bar readout. */
export function OrderQueueSummaryLine({ records }: { records: readonly ShippedOrder[] }) {
  const counts = useQueueCounts(records);
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 items-center gap-3 truncate')} data-testid="order-queue-summary-line">
      {QUEUE_STATUS_CHIPS.map((state) => (
        <span key={state} className={recordStateCodeClass(LIFECYCLE[state])} title={LIFECYCLE[state].label}>
          {LIFECYCLE[state].code} <span className="tabular-nums">{counts[state]}</span>
        </span>
      ))}
    </span>
  );
}

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;

/**
 * Triage: the queue counts as FILTERS above the cards (owner 2026-09-27). A
 * chip counts ORDERS — a card with any line in that status — so clicking it
 * shows exactly that many cards. Several chips OR together; Reset (or Esc)
 * clears them.
 */
export function OrderQueueSummaryChips({
  orders,
  active,
  onToggle,
  onReset,
}: {
  /** One entry per card: that order's lines. */
  orders: readonly (readonly ShippedOrder[])[];
  active: ReadonlySet<LifecycleState>;
  onToggle: (key: LifecycleState) => void;
  onReset: () => void;
}) {
  const railRef = useRef<HTMLSpanElement>(null);
  useHorizontalWheelScroll(railRef);
  const counts = useMemo(() => {
    const tally = emptyQueueCounts();
    for (const lines of orders) {
      for (const state of new Set(lines.map(recordState))) tally[state] += 1;
    }
    return tally;
  }, [orders]);
  return (
    <span
      ref={railRef}
      role="group"
      aria-label="Filter by status"
      data-testid="order-queue-summary-chips"
      // One sideways-scrolling rail on any width (mobile first): snap per chip,
      // plain wheel scrolls it, no scrollbar, a right-edge fade says there is more.
      className="flex w-full min-w-0 snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {QUEUE_STATUS_CHIPS.map((key) => {
        const face = LIFECYCLE[key];
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
