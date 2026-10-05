'use client';

/**
 * Status counts as filter chips — the triage desks' status rail. {@link StatusChipRail}
 * paints any family's chips (the Exceptions desk's kinds); {@link QueueStatusChips} is
 * the To-ship desk's and the phone pick queue's (owner 2026-09-28: the same counts on
 * every device). A chip counts CARDS, so tapping it shows exactly that many. The host
 * decides whether chips OR together or pick one; Reset (or Esc) clears them. The host
 * counts; this paints.
 *
 * Placement (owner ruling A4, 2026-10-04): chips that filter are CONTROLS — a desktop
 * page declares its statuses as facets in its own contextual sidebar (NAV_PAGE_DECLS +
 * its NAV_FACET_GROUPS context), never this rail in a page body or a list's
 * `summary` / `banner` slot. Body mounts are queued debt (ledger `body-status-chip-rails`,
 * loop rule `layout.sidebar-owns-table-controls`); phones are exempt pending the mobile
 * filter-home ruling.
 */

import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { LIFECYCLE, STATE_TONE_CLASSES, type LifecycleState, type StateName } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;

/** A lifecycle tone name, or a family's own face (the helpdesk statuses' house hues, `@/design-system/tokens/ticket-status`). */
export type StatusChipTone = StateName | { pill: string; border: string; dot: string };

/** One chip: its filter key, face, tone (the dot and the lit pill) and card count. */
export interface StatusChip<K extends string> {
  id: K;
  label: string;
  tone: StatusChipTone;
  count: number;
}

export function StatusChipRail<K extends string>({
  chips,
  active,
  onToggle,
  onReset,
  label = 'Filter by status',
  testId,
}: {
  /** The chips, in order. */
  chips: readonly StatusChip<K>[];
  active: ReadonlySet<K>;
  onToggle: (key: K) => void;
  onReset: () => void;
  /** The rail's accessible name. */
  label?: string;
  testId: string;
}) {
  const railRef = useRef<HTMLSpanElement>(null);
  useHorizontalWheelScroll(railRef);
  return (
    <span
      ref={railRef}
      role="group"
      aria-label={label}
      data-testid={testId}
      // One sideways-scrolling rail on any width (mobile first): snap per chip,
      // plain wheel scrolls it, no scrollbar, a right-edge fade says there is more.
      className="flex w-full min-w-0 snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map(({ id: key, label: face, tone: toneName, count }) => {
        const tone = typeof toneName === 'string' ? STATE_TONE_CLASSES[toneName] : toneName;
        const on = active.has(key);
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
            {face}
            <span className="font-semibold tabular-nums">{count}</span>
          </motion.button>
        );
      })}
      <AnimatePresence initial={false}>
        {active.size > 0 ? (
          <HoverTooltip key="reset" asChild label="Reset filters" shortcut="Esc">
          <motion.button
            type="button"
            data-testid="status-filter-reset"
            onClick={onReset}
            initial={{ opacity: 0, scale: 0.6, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: -8 }}
            whileTap={{ scale: 0.94 }}
            transition={CHIP_SPRING}
            className={cn(
              'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full bg-text-default px-3 text-xs font-semibold text-surface-card shadow-elev-raised',
              focusRing('control'),
            )}
          >
            Reset filters
          </motion.button>
          </HoverTooltip>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/** The To-ship queue's rail: lifecycle states, counted in ORDERS (`queueStatusCounts`, `@/lib/orders/to-ship-queue`); several OR together. */
export function QueueStatusChips({
  statuses,
  counts,
  active,
  onToggle,
  onReset,
}: {
  /** The chips, in order. */
  statuses: readonly LifecycleState[];
  /** Orders per status. */
  counts: Readonly<Record<LifecycleState, number>>;
  active: ReadonlySet<LifecycleState>;
  onToggle: (key: LifecycleState) => void;
  onReset: () => void;
}) {
  const chips = statuses.map((key) => ({ id: key, label: LIFECYCLE[key].label, tone: LIFECYCLE[key].tone, count: counts[key] }));
  return <StatusChipRail chips={chips} active={active} onToggle={onToggle} onReset={onReset} testId="order-queue-summary-chips" />;
}
