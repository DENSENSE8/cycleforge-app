'use client';

/**
 * TriageLedger — the FOCUS state's main display: the ranked task list.
 *
 * ## The instrument row spec (the law this file enforces)
 *
 * Every row is the SAME instrument. Rank is POSITION plus one accent — never
 * font size. One typographic voice: `text-sm` sentence-case titles beside
 * `INSTRUMENT_VALUE` mono tabular figures. Six fixed columns on one baseline:
 *
 *   rank · title · lane · count · age · verb
 *
 * Nothing wraps horizontally (the ledger scrolls vertically by lane), no pills
 * beside sentences, no serif in the instrument, and numbers live in columns,
 * never woven into prose. The superseded first row mixed a 24px serif lead,
 * ~11px pill counters and a 12px caption inside one baseline — three voices
 * shouting over each other; that failure mode is what this spec exists to
 * prevent.
 *
 * ## Every row is a verb
 *
 * A row's click SEEDS its question into the composer — the operator reads
 * what they are about to ask and presses Enter (Law 15: seed never sends).
 * Hover carries the WHY on the cursor (`HoverTooltip` → MorphCursorLayer on
 * fine pointers, anchored bubble otherwise). Native `title` tooltips are
 * banned here: they were the regression this component replaces.
 *
 * ## Grouping
 *
 * Ranking is lane-first, so the flat ranked list IS the grouping. When the
 * lane changes between consecutive rows, a lane header (eyebrow + count +
 * the lane's why) cuts the section — no sticky headers, no nested scrollers.
 *
 * ## States
 *
 * Loading paints skeleton ROWS shaped like the final grid (never a spinner
 * replacing the instrument). Empty renders the fallback — the all-clear line.
 * A failed poll never reaches this component: `useOperatorPulse` keeps the
 * last good items.
 *
 * ## Keyboard
 *
 * ↑/↓ walk the rows, Enter/Space seeds (native button), Tab reaches rows in
 * rank order. Mouse is an alias, never the only path.
 */

import { useRef, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { springConcierge } from '@/design-system/motion/tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { INSTRUMENT_VALUE } from '@/design-system/tokens/instrument';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  PULSE_LANE_FACE,
  type PulseItem,
  type PulseLane,
} from '@/lib/assistant/operator-pulse';
import { cn } from '@/utils/_cn';

/** One grid for header, rows and skeletons — columns can never drift apart. */
const ROW_GRID =
  'grid grid-cols-[3ch_minmax(0,1fr)_auto_minmax(3ch,auto)_minmax(4ch,auto)_auto] items-baseline gap-x-3';

/** Compact instrument age: `4d`, `12d`, `now` — mono-width by construction. */
function ageCompact(days: number | null): string {
  if (days == null) return '—';
  if (days < 1) return 'now';
  return `${days}d`;
}

const ROW_RISE = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
} as const;

export function TriageLedger({
  items,
  loading = false,
  onPick,
  fallback,
}: {
  /** Ranked worst-first from `operatorPulse` — the FULL set, never capped. */
  items: PulseItem[];
  loading?: boolean;
  /** Seeds the question into the composer. Never sends. */
  onPick: (question: string) => void;
  /** Rendered when nothing is stuck — the all-clear line. */
  fallback: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-3" data-testid="triage-ledger-skeleton" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn(ROW_GRID, 'h-9 animate-pulse items-center')}>
            <div className="col-span-1 h-3 rounded-sm bg-surface-sunken" />
            <div className="h-3 rounded-sm bg-surface-sunken" style={{ width: `${52 - i * 7}%` }} />
            <div className="h-3 w-10 rounded-sm bg-surface-sunken" />
            <div className="h-3 w-4 rounded-sm bg-surface-sunken" />
            <div className="h-3 w-6 rounded-sm bg-surface-sunken" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return <>{fallback}</>;

  const walk = (delta: number, from: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-triage-row]');
    if (!rows || rows.length === 0) return;
    const target = rows[(from + delta + rows.length) % rows.length];
    target?.focus();
  };

  const laneTotals = items.reduce<Record<PulseLane, number>>(
    (acc, i) => ({ ...acc, [i.lane]: (acc[i.lane] ?? 0) + i.count }),
    { promised: 0, blocked: 0, latent: 0 },
  );

  let lastLane: PulseLane | null = null;

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="What needs you now, ranked worst first"
      data-testid="triage-ledger"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const rows = Array.from(
          listRef.current?.querySelectorAll<HTMLButtonElement>('[data-triage-row]') ?? [],
        );
        const from = rows.indexOf(document.activeElement as HTMLButtonElement);
        if (from < 0) return;
        e.preventDefault();
        walk(e.key === 'ArrowDown' ? 1 : -1, from);
      }}
    >
      {items.map((item, idx) => {
        const newLane = item.lane !== lastLane;
        lastLane = item.lane;
        const face = PULSE_LANE_FACE[item.lane];
        const rank = String(idx + 1).padStart(2, '0');
        return (
          <div key={item.id}>
            {newLane ? (
              <div className="mt-3 flex items-baseline gap-2 border-t border-border-hairline px-2 pt-2 first:mt-0 first:border-t-0 first:pt-0">
                <span className={sectionLabel}>{face.label}</span>
                <span className="text-role-micro text-text-faint">{face.why}</span>
                <span className={cn('ml-auto', INSTRUMENT_VALUE)}>{laneTotals[item.lane]}</span>
              </div>
            ) : null}
            {/*
              The row. ONE face for every rank: same height, same columns, same
              baseline. The ONLY rank signal besides position is the gilt ink
              on #1's index — the single accent the screen spends.
            */}
            <HoverTooltip label={`Why #${idx + 1}: ${item.question}`} asChild>
              <motion.button
                type="button"
                role="listitem"
                data-triage-row
                data-triage-rank={idx + 1}
                onClick={() => onPick(item.question)}
                variants={ROW_RISE}
                initial="hidden"
                animate="show"
                transition={springConcierge}
                className={cn(
                  'ds-raw-button w-full px-2 text-left',
                  ROW_GRID,
                  'h-9 rounded-sm transition-colors hover:bg-surface-hover',
                  focusRing('control', 'accent'),
                )}
              >
                <span
                  className={cn(
                    'font-mono text-role-caption tabular-nums',
                    idx === 0 ? 'font-semibold text-text-gilt' : 'text-text-faint',
                  )}
                >
                  {rank}
                </span>
                <span className="min-w-0 truncate text-sm text-text-default">{item.headline}</span>
                <span className="text-role-micro uppercase tracking-[0.08em] text-text-muted">
                  {item.lane}
                </span>
                <span className={cn('text-right', INSTRUMENT_VALUE)}>{item.count.toLocaleString()}</span>
                <span className="text-right font-mono text-role-caption tabular-nums text-text-muted">
                  {ageCompact(item.ageDays)}
                </span>
                <span className="text-role-caption text-text-muted">Triage ›</span>
              </motion.button>
            </HoverTooltip>
          </div>
        );
      })}
    </div>
  );
}
