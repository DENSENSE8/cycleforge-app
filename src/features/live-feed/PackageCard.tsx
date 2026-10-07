'use client';

/**
 * One package on the board. Hierarchy, top to bottom: WHAT (photo + product
 * title), WHOSE (channel · order number · carrier), then one row with the
 * PRESSURE on the left (the ship-by SLA, stalled, out of stock, its box, its
 * tags) and the line's facts on the right (`PackageFacts`: quantity above
 * one, grade, price), then WHERE (the stage track, how long it has sat
 * there, comments, who touched it last).
 *
 * The whole card opens the package (a full-card target under the content, as
 * RecordCard's); its checkbox selects it for the bulk bar. State (hover,
 * selected, open) is an overlay border inside the card (`STATE_OUTLINE_CLASS`),
 * never a ring: the column scrolls, and a scroller clips anything painted
 * outside its items.
 */

import { memo, type MouseEvent } from 'react';
import { Boxes, MessageSquare } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { CardCheck } from '@/design-system/components/record-card/RecordCard';
import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { RecordPhoto } from '@/design-system/components/record-ledger/RecordPhoto';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { resolveMarketplaceChipIdentity } from '@/lib/marketplace-order-id';
import type { PackageCard as PackageCardData, PackageStep } from '@/lib/live-feed/types';
import { platformMetaBrandDot, sourcePlatformLabel, sourcePlatformMeta } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import { formatLaneAgeCompact, formatTime12hPST } from '@/utils/date';
import { PackageFacts } from './PackageFacts';
import { Pill, ShipByPill, TagPill } from './pills';
import { STAGE_LOOK } from './stage-look';
import { StageTrack } from './StageTrack';
import { CardDocs } from './card-docs';

/** The step that put the package in its stage — its staffer is the card's last hand. */
function lastStep(card: PackageCardData): PackageStep | null {
  if (card.stage === 'scanned_out') return card.steps.scannedOut;
  if (card.stage === 'packed') return card.steps.packed;
  if (card.stage === 'picked') return card.steps.picked;
  return null;
}

/** How the checkbox shows: on hover (a desk at rest), always (something is selected / phone select mode), or never. */
export type PackageCheckMode = 'hover' | 'shown' | 'off';

export const PackageCard = memo(function PackageCard({
  card,
  now,
  selected,
  checked,
  checkMode,
  onOpen,
  onToggleCheck,
}: {
  card: PackageCardData;
  now: number | null;
  /** The open package. */
  selected: boolean;
  /** In the bulk selection. */
  checked: boolean;
  checkMode: PackageCheckMode;
  onOpen: (card: PackageCardData) => void;
  onToggleCheck: (card: PackageCardData, event: { shiftKey: boolean }) => void;
}) {
  const look = STAGE_LOOK[card.stage];
  // The channel, else what the order number's own format says (eBay's 12-34567-89012) — as the print pane reads it.
  const stored = sourcePlatformMeta(card.platform);
  const platform = resolveMarketplaceChipIdentity(card.orderNumber, stored.value ? stored.label : null).meta;
  const step = lastStep(card);
  const done = card.stage === 'scanned_out';
  // Scanned out is today's: the time it left. Open stages: how long it has sat.
  const age = done ? formatTime12hPST(card.enteredAt) : now != null ? formatLaneAgeCompact(card.enteredAt, now) : null;
  const showCheck = checkMode !== 'off';
  // In a selection, a card tap toggles it (the bulk bar's gesture); otherwise it opens.
  const onCard = (event: MouseEvent) => {
    if (checkMode === 'shown' || event.shiftKey || event.metaKey || event.ctrlKey) onToggleCheck(card, { shiftKey: event.shiftKey });
    else onOpen(card);
  };

  return (
    <article
      data-package-card={card.orderRowId}
      aria-label={card.title}
      className={cn('@container/card group/card relative isolate rounded-xl bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md', selected && 'shadow-md')}
    >
      {/* ds-raw-button: the whole-card open target under the content, as RecordCard's — not a visible control. */}
      <button
        type="button"
        aria-label={`Open ${card.title}`}
        aria-current={selected ? 'true' : undefined}
        data-package-open={card.orderRowId}
        onClick={onCard}
        className={cn('absolute inset-0 z-0 cursor-pointer rounded-[inherit]', focusRing('cell'))}
      />
      {/* Identity first: the order number top left, the platform it came from top right. */}
      <div className="pointer-events-none relative z-10 mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
        <span className="truncate font-mono font-medium tabular-nums text-slate-700" title={card.orderNumber ?? undefined} data-testid="live-feed-card-order">
          {card.orderNumber ?? (card.link === 'order' ? 'No order #' : 'Not linked')}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-slate-500">
          <BrandIdentityDot {...platformMetaBrandDot(platform)} />
          {platform.value ? platform.label : sourcePlatformLabel(card.platform)}
        </span>
      </div>
      <div className="pointer-events-none relative z-10 flex gap-3 @max-[15rem]/card:gap-2">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-900/5 @max-[15rem]/card:size-9">
          <RecordPhoto src={card.photoUrl} fallback={card.title} />
          {showCheck ? (
            <span
              className={cn(
                'absolute left-1 top-1',
                checkMode === 'hover' && !checked && 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100',
              )}
            >
              <CardCheck checked={checked} label={`Select ${card.title}`} testId={`live-feed-check-${card.orderRowId}`} onToggle={(event) => onToggleCheck(card, event)} />
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{card.title}</p>
          {card.carrier ? <p className="mt-1 truncate text-xs text-slate-500 @max-[15rem]/card:hidden">{card.carrier}</p> : null}
        </div>
      </div>

      {/* A narrow column wraps the facts under the pressure pills rather than clipping either. */}
      <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex min-w-0 flex-wrap gap-1">
          <ShipByPill card={card} now={now} />
          {card.stalled ? <Pill tone="warning">Stalled</Pill> : null}
          {card.blocked ? <Pill tone="danger">Out of stock</Pill> : null}
          {card.boxMates.length > 0 ? (
            <Pill tone="info">
              <Boxes className="size-3" />
              Box of {card.boxMates.length + 1}
            </Pill>
          ) : null}
          {card.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </span>
        <PackageFacts card={card} className="ml-auto text-xs" />
      </div>

      <div className="pointer-events-none relative z-10 mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2">
        <span className="contents @max-[13rem]/card:hidden">
          <StageTrack stage={card.stage} />
        </span>
        {age ? (
          <span className={cn('whitespace-nowrap text-xs tabular-nums', done ? 'text-slate-500' : 'font-medium text-slate-600')}>
            {done ? age : `${age} here`}
          </span>
        ) : null}
        <CardDocs card={card} />
        <span className="ml-auto flex items-center gap-2">
          {card.noteCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500" aria-label={`${card.noteCount} comments`}>
              <MessageSquare className="size-3.5" />
              {card.noteCount}
            </span>
          ) : null}
          {step?.staffId ? <StaffAvatar staffId={step.staffId} name={step.staffName} size="xs" /> : null}
        </span>
      </div>

      <span
        aria-hidden
        className={cn(
          STATE_OUTLINE_CLASS,
          selected ? cn('border-2', look.outline) : checked ? 'border-2 border-slate-900' : 'border-slate-900/5 group-hover/card:border-slate-900/10',
        )}
      />
    </article>
  );
});
