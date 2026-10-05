'use client';

/**
 * A rail of rounded status chips over a triage list (`IncomingStatusChipSet`:
 * label, counts, tone, one pressed). Inbound's own statuses left it for the
 * sidebar (ruling A4: the `incoming.pipeline` facet and `pastedListBuckets`;
 * their ⌥ keys are `useIncomingStatusChords`).
 */

import { useRef } from 'react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { motion } from 'motion/react';
import { segmentChordHint } from '@/lib/keyboard/segment-chords';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface IncomingStatusChip {
  id: string;
  label: string;
  /** Null while the count is loading. */
  count: number | null;
  tone: StateName | null;
  active: boolean;
}

export interface IncomingStatusChipSet {
  /** The group's accessible name. */
  label: string;
  chips: IncomingStatusChip[];
  /** Set when the chips cannot filter honestly (e.g. a partial row set). */
  disabledReason: string | null;
  onToggle: (id: string) => void;
  /** ⌥1–⌥N hints on these chips (default); the host binds the keys. */
  chords?: boolean;
  /** `incoming-status` (default) → `incoming-status-<id>`, `incoming-status-chips`. */
  testIdPrefix?: string;
}

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;
const CHIP_RAIL_CLASS =
  'flex w-full min-w-0 snap-x snap-proximity items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Rounded chips over the triage cards. */
export function IncomingStatusChips({ set }: { set: IncomingStatusChipSet }) {
  const disabled = set.disabledReason != null;
  const chords = set.chords !== false;
  const testIdPrefix = set.testIdPrefix ?? 'incoming-status';
  const railRef = useRef<HTMLSpanElement>(null);
  useHorizontalWheelScroll(railRef);
  return (
    <span
      ref={railRef}
      role="group"
      aria-label={set.label}
      title={set.disabledReason ?? undefined}
      data-testid={`${testIdPrefix}-chips`}
      className={cn(CHIP_RAIL_CLASS, 'gap-1.5 py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]')}
    >
      {set.chips.map((chip, index) => {
        const tone = chip.tone ? STATE_TONE_CLASSES[chip.tone] : null;
        const count = chip.count;
        const live = count == null || count > 0 || chip.active;
        const shortcut = chords ? segmentChordHint(index + 1) : null;
        const common = {
          type: 'button' as const,
          'aria-pressed': chip.active,
          'aria-keyshortcuts': chords ? `Alt+${index + 1}` : undefined,
          'data-testid': `${testIdPrefix}-${chip.id}`,
          disabled,
          title: disabled ? (set.disabledReason ?? undefined) : shortcut ? `${chip.label} (${shortcut})` : chip.label,
          onClick: () => set.onToggle(chip.id),
        };
        const dot = (
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', live && tone ? tone.dot : 'bg-border-default')}
          />
        );
        const tally = <span className="font-semibold tabular-nums">{count == null ? '…' : count.toLocaleString()}</span>;
        return (
          <motion.button
            key={chip.id}
            {...common}
            whileTap={disabled ? undefined : { scale: 0.94 }}
            transition={CHIP_SPRING}
            className={cn(
              'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              chip.active && tone
                ? cn(tone.pill, tone.border, 'font-semibold shadow-elev-soft')
                : chip.active
                  ? 'border-border-strong bg-surface-card font-semibold text-text-default shadow-elev-soft'
                  : live
                    ? 'border-transparent bg-surface-sunken text-text-default hover:border-border-strong'
                    : 'border-transparent text-text-faint',
              focusRing('control'),
            )}
          >
            {dot}
            {chip.label}
            {tally}
          </motion.button>
        );
      })}
    </span>
  );
}
