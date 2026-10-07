'use client';

/**
 * One fulfilled order on the board — the minimum to recognise it (operator
 * 2026-10-06, `HANDOFF-fulfilled-drilldown.md` L1): WHOSE (order number, last
 * 8, · customer, or the item when there is no customer), then its CLOCK —
 * time in status against the limit (`Stalled · 3d / 3d`, toned calm · near ·
 * over). Carrier, tracking, the carrier's latest words, place, ETA and
 * freshness live one level down, on the order (L3); a failing carrier sync is
 * the board's one banner, never a per-card badge.
 *
 * The whole card opens the order (a full-card target under the content, as
 * RecordCard's); the order chip stays live above it. State (hover, open) is an
 * overlay border inside the card (`STATE_OUTLINE_CLASS`), never a ring or a
 * shadow: the column scrolls, and a scroller clips anything painted outside
 * its items.
 */

import { memo } from 'react';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { JourneyClockCell } from '@/components/outbound/fulfilled/JourneyClockCell';
import { OrderIdChip } from '@/components/ui/CopyChip';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { cn } from '@/utils/_cn';
import type { JourneyLook } from './journey-look';

export const JourneyCard = memo(function JourneyCard({
  entry,
  status,
  look,
  open,
  onOpen,
}: {
  entry: BulkEntry;
  /** The column's bucket word, leading the clock (`Stalled · 3d / 3d`). */
  status: string;
  look: JourneyLook;
  /** Its order is open in the record plane. */
  open: boolean;
  onOpen: (entry: BulkEntry) => void;
}) {
  const facts = entry.facts ?? null;
  const item = facts?.title ? (facts.lineCount != null && facts.lineCount > 1 ? `${facts.title} +${facts.lineCount - 1}` : facts.title) : null;
  const who = facts?.customer ?? item;
  return (
    <article
      // The plane hands focus back to this card when its package closes.
      {...{ [DESK_RECORD_KEY_ATTR]: facts?.shipmentId != null ? String(facts.shipmentId) : undefined }}
      data-testid="fulfilled-board-card"
      data-order={entry.ref}
      className="group/card relative isolate flex flex-col gap-1 rounded-xl bg-surface-card px-3 py-2 text-left"
    >
      {/* ds-raw-button: the whole-card open target under the card's own copy chip (RecordCard's pattern); a Button paints a control face over the card. */}
      <button
        type="button"
        aria-label={`Open order ${entry.ref}`}
        aria-current={open ? 'true' : undefined}
        data-journey-open={entry.ref}
        data-testid="fulfilled-board-card-open"
        onClick={() => onOpen(entry)}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-[inherit]', focusRing('cell'))}
      />
      <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-1.5">
        <span className="pointer-events-auto shrink-0">
          <OrderIdChip value={entry.ref} dense />
        </span>
        {who ? (
          <span className="min-w-0 truncate text-role-body font-semibold text-text-default" title={who}>
            {who}
          </span>
        ) : null}
        {facts?.mentionsMe ? (
          <span
            role="img"
            aria-label="You are mentioned on this order"
            title="You are mentioned on this order"
            data-testid="fulfilled-board-card-mention"
            className={cn('ml-auto size-2 shrink-0 rounded-full', STATE_TONE_CLASSES.info.dot)}
          />
        ) : null}
      </div>
      <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
        <JourneyClockCell clock={facts?.clock} status={status} className="min-w-0 flex-1 text-role-caption" />
      </div>
      <span
        aria-hidden
        className={cn(STATE_OUTLINE_CLASS, open ? cn('border-2', look.outline) : 'border-border-hairline group-hover/card:border-border-soft')}
      />
    </article>
  );
});
