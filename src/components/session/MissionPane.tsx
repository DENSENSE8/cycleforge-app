'use client';

/**
 * MissionPane — the RIGHT pane of the focus state: what is happening on the
 * floor, at a glance, read-only.
 *
 * ## Two instruments, one pane
 *
 *   1. The TELEMETRY STRIP — one machined cell per business pillar, summed
 *      from the SAME ranked pulse items the ledger draws (`pulsePillarTotals`
 *      over the same `/api/home-board` read — one query, one truth, Law 15).
 *      A cell click seeds that pillar's worst question through the composer
 *      seed bus; it never sends and never mutates.
 *   2. The FLOOR FEED — the live event stream (`/api/activity/feed`: scans,
 *      packs, shipments, stock deltas), newest first, mono timestamps. It is
 *      ambient telemetry: rows render, period. No hover verbs, no links, no
 *      click targets — the read-only mission-pane law.
 *
 * ## Material
 *
 * The strip is the house `INSTRUMENT_PLATE` — anodised plate, hairline
 * bezel, machined `divide-x` cells — so it re-tempers itself on every theme
 * (Paper, Ember, dark) instead of hard-coding a cockpit that fights the
 * customer's scheme. Numerals are `INSTRUMENT_VALUE` (mono, tabular, 600).
 */

import { motion } from '@/design-system/motion';
import { springConcierge } from '@/design-system/motion/tokens';
import {
  INSTRUMENT_CELL,
  INSTRUMENT_LABEL,
  INSTRUMENT_PLATE,
  INSTRUMENT_VALUE,
} from '@/design-system/tokens/instrument';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import {
  PULSE_PILLAR_LABEL,
  pulsePillarTotals,
  type PulseItem,
} from '@/lib/assistant/operator-pulse';
import { useFloorFeed, floorFeedFace } from './useFloorFeed';
import { cn } from '@/utils/_cn';

/** `14:32:07` — the feed's clock. Local time: the operator's shift, not UTC. */
function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString([], { hour12: false });
}

const FEED_ROW_RISE = {
  hidden: { opacity: 0, x: 10 },
  show: { opacity: 1, x: 0 },
} as const;

export function MissionPane({
  className,
  items,
  loading = false,
}: {
  className?: string;
  /** The SAME ranked pulse items the ledger renders — one query feeds both. */
  items: PulseItem[];
  loading?: boolean;
}) {
  const feed = useFloorFeed();
  const totals = pulsePillarTotals(items);

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col gap-3 p-3', className)}
      data-testid="mission-pane"
      aria-label="Mission pane — floor telemetry"
    >
      {/*
        The telemetry strip. Pillar cells are the only interactive thing on
        this pane, and their whole behavior is seeding a question — the same
        verb as the ledger row beside them, never a second query.
      */}
      <div className="flex shrink-0 items-center justify-center">
        <div className={INSTRUMENT_PLATE} data-testid="mission-telemetry">
          {totals.map((total) => (
            <button
              key={total.pillar}
              type="button"
              disabled={!total.worst}
              onClick={() => {
                // Seed, never send (Law 15). The operator reads the question
                // in the composer and presses Enter themselves.
                if (total.worst) requestComposerSeed({ text: total.worst.question, autoSend: false });
              }}
              className={cn('ds-raw-button', INSTRUMENT_CELL, focusRing('control', 'accent'))}
              aria-label={
                total.worst
                  ? `${PULSE_PILLAR_LABEL[total.pillar]}: ${total.count} — seed the worst question`
                  : `${PULSE_PILLAR_LABEL[total.pillar]}: clear`
              }
            >
              <span className={INSTRUMENT_VALUE}>
                {loading && items.length === 0 ? '—' : total.count.toLocaleString()}
              </span>
              <span className={INSTRUMENT_LABEL}>{PULSE_PILLAR_LABEL[total.pillar]}</span>
            </button>
          ))}
        </div>
      </div>

      {/*
        The floor feed. AMBIENT: every row is a plain <li> — the mission pane
        carries data, never behavior (the read-only law). Mono clock, eyebrow
        tag, one line of body, same grid every row.
      */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-baseline justify-between px-1 pb-1">
          <span className={sectionLabel}>Floor now</span>
          <span className="text-role-micro text-text-faint" data-testid="mission-feed-state">
            {feed.loaded
              ? feed.events.length === 0
                ? 'no recent activity'
                : `last ${clockOf(feed.events[0]?.createdAt ?? '')}`
              : 'listening…'}
          </span>
        </div>
        <ol
          className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto"
          data-testid="mission-feed"
          aria-label="Recent floor activity, newest first"
        >
          {feed.events.map((event, idx) => (
            <motion.li
              key={event.id}
              variants={FEED_ROW_RISE}
              initial={idx < 6 ? 'hidden' : false}
              animate="show"
              transition={springConcierge}
              className="grid grid-cols-[7ch_8ch_minmax(0,1fr)] items-baseline gap-x-2 px-1 py-1"
            >
              <span className="font-mono text-role-caption tabular-nums text-text-faint">
                {clockOf(event.createdAt)}
              </span>
              <span className="text-role-micro uppercase tracking-[0.08em] text-text-muted">
                {floorFeedFace.tagOf(event)}
              </span>
              <span className="min-w-0 truncate text-role-caption text-text-default">
                {floorFeedFace.bodyOf(event)}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
