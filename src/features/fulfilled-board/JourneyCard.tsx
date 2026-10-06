'use client';

/**
 * One fulfilled order on the board, as the Live feed's `PackageCard` but
 * compact. Top to bottom: WHOSE (order number · customer, or the item when
 * there is no customer), WHAT (the item, one line), WHERE the carrier last
 * saw it (`In transit · Anaheim, CA · Oct 5, 8:54 PM · ETA Oct 9`,
 * `journeyCarrierLine` — nobody opens UPS / FedEx to know), how FRESH that is
 * (`Checked 3h ago`, `· sync failing` with the poll error on hover, and
 * Refresh now: one re-poll of this package, `POST /api/shipping/track/sync-one`),
 * then one row with its CLOCK on the left (`Late · 3d / 1d`, toned calm ·
 * near · over) and HOW it travels on the right (carrier · tracking). Compact
 * (the sidebar's Cards › Compact) keeps whose, where and the clock.
 *
 * The whole card opens the order's package (a full-card target under the
 * content, as RecordCard's); the copy chips and Refresh now stay live above
 * it. State (hover, open) is an overlay border inside the card
 * (`STATE_OUTLINE_CLASS`), never a ring or a shadow: the column scrolls, and
 * a scroller clips anything painted outside its items.
 */

import { memo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from '@/components/Icons';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { JourneyClockCell } from '@/components/outbound/fulfilled/JourneyClockCell';
import { NAV_FULFILLED_QUERY_ROOT } from '@/components/outbound/fulfilled/useFulfilledList';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { journeyCarrierLine, journeyFreshness } from './fulfilled-board-model';
import type { JourneyLook } from './journey-look';

export const JourneyCard = memo(function JourneyCard({
  entry,
  status,
  look,
  open,
  onOpen,
  now,
  compact,
}: {
  entry: BulkEntry;
  /** The column's bucket word, leading the clock (`Late · 3d / 1d`). */
  status: string;
  look: JourneyLook;
  /** Its package is open in the record plane. */
  open: boolean;
  onOpen: (entry: BulkEntry) => void;
  /** The viewer's now (`useJourneyNow`; null through hydration) — the freshness line's clock. */
  now: number | null;
  /** The sidebar's Cards › Compact. */
  compact: boolean;
}) {
  const facts = entry.facts ?? null;
  const tracking = facts?.tracking ?? facts?.trackings?.[0] ?? null;
  const item = facts?.title ? (facts.lineCount != null && facts.lineCount > 1 ? `${facts.title} +${facts.lineCount - 1}` : facts.title) : null;
  const who = facts?.customer ?? item;
  const carrierLine = journeyCarrierLine(facts);
  const freshness = compact ? null : journeyFreshness(facts, now);
  return (
    <article
      // The plane hands focus back to this card when its package closes.
      {...{ [DESK_RECORD_KEY_ATTR]: facts?.shipmentId != null ? String(facts.shipmentId) : undefined }}
      data-testid="fulfilled-board-card"
      data-order={entry.ref}
      className="group/card relative isolate flex flex-col gap-1 rounded-xl bg-surface-card px-3 py-2.5 text-left"
    >
      {/* ds-raw-button: the whole-card open target under the card's own copy chips (RecordCard's pattern); a Button paints a control face over the card. */}
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
      </div>
      {item && facts?.customer && !compact ? (
        <p className="pointer-events-none relative z-10 truncate text-role-caption text-text-muted" title={item}>
          {item}
        </p>
      ) : null}
      {carrierLine ? (
        <p
          className="pointer-events-none relative z-10 truncate text-role-caption font-medium text-text-default"
          title={carrierLine}
          data-testid="fulfilled-board-card-carrier-line"
        >
          {carrierLine}
        </p>
      ) : null}
      {freshness ? (
        <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-1 text-role-micro text-text-muted" data-testid="fulfilled-board-card-freshness">
          <span className="truncate tabular-nums">{freshness.text}</span>
          {freshness.error ? (
            <span className={cn('pointer-events-auto shrink-0 font-medium', STATE_TONE_CLASSES.warning.text)}>
              <HoverTooltip label={freshness.error}>· sync failing</HoverTooltip>
            </span>
          ) : null}
          {facts?.shipmentId != null ? <RefreshNow shipmentId={facts.shipmentId} order={entry.ref} /> : null}
        </div>
      ) : null}
      <div className="pointer-events-none relative z-10 mt-1 flex min-w-0 items-center gap-2 border-t border-border-hairline pt-1.5">
        <JourneyClockCell clock={facts?.clock} status={status} className="min-w-0 flex-1 text-role-caption" />
        {facts?.carrier ? <span className="shrink-0 text-role-micro font-medium text-text-muted">{facts.carrier}</span> : null}
        {tracking ? (
          <span className="pointer-events-auto shrink-0">
            <TrackingChip value={tracking} carrierHint={facts?.carrier ?? null} dense />
          </span>
        ) : null}
      </div>
      <span
        aria-hidden
        className={cn(STATE_OUTLINE_CLASS, open ? cn('border-2', look.outline) : 'border-border-hairline group-hover/card:border-border-soft')}
      />
    </article>
  );
});

/**
 * Re-poll this one package now (`POST /api/shipping/track/sync-one`), then
 * re-read the board so the card shows what the carrier just said. A failure
 * (credentials missing, the carrier timing out) says so in a toast.
 */
function RefreshNow({ shipmentId, order }: { shipmentId: number; order: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/shipping/track/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(`Couldn't refresh order ${order}: ${body?.error ?? `HTTP ${res.status}`}`);
      }
      await queryClient.invalidateQueries({ queryKey: [NAV_FULFILLED_QUERY_ROOT] });
    } catch {
      toast.error(`Couldn't refresh order ${order}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <HoverTooltip label="Refresh now" asChild>
      <IconButton
        ariaLabel={`Refresh now — order ${order}`}
        size="xs"
        icon={<RefreshCw className={cn('size-3', busy && 'animate-spin')} />}
        disabled={busy}
        onClick={() => void refresh()}
        data-testid="fulfilled-board-card-refresh"
        className="pointer-events-auto ml-auto shrink-0"
      />
    </HoverTooltip>
  );
}
