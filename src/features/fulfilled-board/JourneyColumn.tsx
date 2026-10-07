'use client';

/**
 * One bucket of the Fulfilled board, as the Live feed's `StageColumn`: a
 * header that answers "how many, how bad" — the bucket, its exact count, how
 * many are over their threshold and the oldest — over a list of cards that
 * scrolls on its own, worst first. The header (its word, or the expand icon)
 * zooms into the column: every order in it, over the board (`?col=`, L2). A
 * column paints at most {@link FULFILLED_BOARD_CARD_CAP} cards; Show all is
 * the same zoom. An empty bucket folds to a slim rail (count + label read top
 * to bottom) that unfolds on click.
 */

import { memo } from 'react';
import { Maximize2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import type { FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import { cn } from '@/utils/_cn';
import {
  FULFILLED_BOARD_CARD_CAP,
  FULFILLED_BUCKET_HINT,
  fulfilledColumnMeta,
  groupCardsByCarrier,
  type FulfilledBoardCard,
  type FulfilledBoardColumn,
} from './fulfilled-board-model';
import { JourneyCard } from './JourneyCard';
import { JOURNEY_LOOK } from './journey-look';

/** The column's one fixed width — the strip runs off the page to the right. */
const COLUMN_WIDTH_CLASS = 'w-80';

export const JourneyColumn = memo(function JourneyColumn({
  column,
  openShipmentId,
  onOpen,
  onExpand,
  groupByCarrier,
}: {
  column: FulfilledBoardColumn<BulkEntry>;
  /** The package open in the record plane — its card wears the open outline. */
  openShipmentId: number | null;
  onOpen: (entry: BulkEntry) => void;
  /** Zoom into this column (`?col=`): every order in it, over the board. */
  onExpand: (bucket: FulfilledBucketId) => void;
  /** The sidebar's Group by › Carrier: the cards under UPS / FedEx / USPS sub-headers. */
  groupByCarrier: boolean;
}) {
  const look = JOURNEY_LOOK[column.tone];
  const shown = column.cards.slice(0, FULFILLED_BOARD_CARD_CAP);
  const meta = fulfilledColumnMeta(column);
  const reveal = useMotionRole(motionRole.swap.focus);
  const cardList = (cards: readonly FulfilledBoardCard<BulkEntry>[]) => (
    <ul className="flex flex-col gap-1.5">
      {cards.map(({ entry }) => (
        <li key={entry.key ?? entry.ref}>
          <JourneyCard
            entry={entry}
            status={column.label}
            look={look}
            open={openShipmentId != null && entry.facts?.shipmentId === openShipmentId}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  );
  const showAll = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onExpand(column.id)}
      data-testid={`fulfilled-board-show-all-${column.id}`}
      className="h-6 px-2 text-xs font-medium"
    >
      Show all
    </Button>
  );

  return (
    <motion.section
      data-journey-column={column.id}
      data-testid={`fulfilled-board-column-${column.id}`}
      aria-label={`${column.label}: ${column.count}`}
      className={cn('flex min-h-0 shrink-0 flex-col rounded-2xl bg-surface-sunken', COLUMN_WIDTH_CLASS)}
      initial={reveal.presence.initial}
      animate={reveal.presence.animate}
      transition={reveal.transition}
    >
      <span aria-hidden className={cn('mx-3 mt-3 h-1 rounded-full', look.bar)} />
      <header className="group/col-head flex items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="-ml-2 flex min-w-0 text-sm font-semibold text-text-default">
            <HoverTooltip label={FULFILLED_BUCKET_HINT[column.id]} asChild openDelayMs={400}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onExpand(column.id)}
                data-testid={`fulfilled-board-column-${column.id}-open`}
                className="h-6 min-w-0 truncate px-2 text-sm font-semibold"
              >
                {column.label}
              </Button>
            </HoverTooltip>
          </h2>
          <p className="truncate text-xs tabular-nums text-text-muted" data-testid={`fulfilled-board-column-${column.id}-meta`}>
            {column.over > 0 ? <span className={cn('font-semibold', look.ink)}>{meta}</span> : meta || (column.count === 0 ? 'None in this window' : '\u00a0')}
          </p>
        </div>
        <HoverTooltip label="Open column" asChild>
          <IconButton
            ariaLabel={`Open ${column.label}: every order in it`}
            size="xs"
            icon={<Maximize2 className="size-3.5" />}
            onClick={() => onExpand(column.id)}
            data-testid={`fulfilled-board-column-${column.id}-expand`}
            className="mt-0.5 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/col-head:opacity-100"
          />
        </HoverTooltip>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-text-default" data-testid={`fulfilled-board-column-${column.id}-count`}>
          <AnimatedStat value={column.count} />
        </span>
      </header>
      {/* Card state outlines are overlay borders inside the card, so the scroller's clip never cuts them.
          Contain the VERTICAL overscroll only: a sideways swipe / Shift + wheel over the cards must chain to the strip. */}
      <div data-journey-scroll className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 pb-3 pt-1">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-muted">No order is here in this window.</p>
        ) : groupByCarrier ? (
          <div className="flex flex-col gap-3">
            {groupCardsByCarrier(shown).map((group) => (
              <section key={group.carrier} aria-label={`${group.carrier}: ${group.cards.length}`} data-carrier-group={group.carrier}>
                <p className="flex items-baseline justify-between px-1 pb-1 text-role-eyebrow text-text-muted">
                  <span>{group.carrier}</span>
                  <span className="tabular-nums">{group.cards.length}</span>
                </p>
                {cardList(group.cards)}
              </section>
            ))}
          </div>
        ) : (
          cardList(shown)
        )}
        {column.count > shown.length && shown.length > 0 ? (
          <p className="flex items-center justify-center gap-1 py-3 text-xs tabular-nums text-text-muted">
            {shown.length} of {column.count}
            <span aria-hidden className="text-text-faint">·</span>
            {showAll}
          </p>
        ) : shown.length > 0 ? (
          <p className="py-3 text-center text-xs tabular-nums text-text-faint">All {column.count}</p>
        ) : null}
      </div>
    </motion.section>
  );
});

/** An EMPTY bucket folded to a slim rail: the tone bar, the count, the label read top to bottom. Click / Enter unfolds it. */
export function JourneyRail({ column, onExpand }: { column: FulfilledBoardColumn<BulkEntry>; onExpand: (bucket: FulfilledBucketId) => void }) {
  const look = JOURNEY_LOOK[column.tone];
  return (
    <section
      data-journey-column={column.id}
      data-testid={`fulfilled-board-rail-${column.id}`}
      aria-label={column.label}
      className="flex min-h-0 w-12 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface-sunken"
    >
      <HoverTooltip label={`${column.label} — ${FULFILLED_BUCKET_HINT[column.id]}`} asChild openDelayMs={400}>
        {/* ds-raw-button: the whole rail is the unfold target (ColumnBoardRail's pattern); a Button paints a control face over the rail. */}
        <button
          type="button"
          onClick={() => onExpand(column.id)}
          aria-label={`${column.label}, ${column.count}. Show the column`}
          className={cn(
            'flex min-h-0 flex-1 flex-col items-center gap-3 pt-3 text-text-muted transition-colors hover:bg-surface-selected hover:text-text-default',
            focusRing('control'),
          )}
        >
          <span aria-hidden className={cn('h-1 w-6 rounded-full', look.bar)} />
          <span className="text-sm font-semibold tabular-nums" data-testid={`fulfilled-board-rail-${column.id}-count`}>
            {column.count}
          </span>
          <span className="whitespace-nowrap text-xs [writing-mode:vertical-rl]">{column.label}</span>
        </button>
      </HoverTooltip>
    </section>
  );
}
