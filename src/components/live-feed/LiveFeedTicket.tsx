'use client';

/**
 * One Live feed BOARD row — a 44px, two-line ticket (no checkbox, no photo):
 * line 1 how long it has sat (open) or when it happened (event), toned by
 * urgency · the order / PO / handle in mono · the carrier's short code;
 * line 2 the lead product's title · ×qty · the staffer's initials.
 * Hover / focus reveals Copy tracking (the full number in its tooltip).
 * Click / Enter unfolds it in place ({@link Collapse}): photo, full title,
 * condition, price, the tracking chip, staff, time, the outbound stage trail
 * and Open record (the split pane beside the board).
 *
 * The board owns the keyboard (`LiveFeedBoard`); the row's face is the one
 * roving tab stop when the board's cursor sits on it.
 */

import { memo } from 'react';
import { Copy, ExternalLink } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { TrackingChip } from '@/components/ui/CopyChip';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Collapse } from '@/design-system/components/Collapse';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { RecordPhoto } from '@/design-system/components/record-ledger/RecordPhoto';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { displayCarrierFromHint, CARRIER_BRANDS } from '@/lib/carrier-brand';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { getLiveFeedStatus } from '@/lib/live-feed/statuses';
import type { LiveFeedItem, LiveFeedItemFlag, LiveFeedTrail } from '@/lib/live-feed/types';
import { lineCondition } from '@/lib/orders/order-card-model';
import { cn } from '@/utils/_cn';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import { liveFeedProduct, liveFeedTicketIdentity, liveFeedTicketWhen } from './live-feed-board-model';

/** The outbound stage trail, in order. */
const TRAIL_STEPS: readonly { key: keyof LiveFeedTrail; label: string }[] = [
  { key: 'packedAt', label: 'Packed' },
  { key: 'scannedOutAt', label: 'Scanned out' },
  { key: 'carrierAt', label: 'With carrier' },
  { key: 'deliveredAt', label: 'Delivered' },
];

const URGENCY_TEXT: Readonly<Record<NonNullable<LiveFeedItem['urgency']>, string>> = {
  late: 'text-text-danger',
  aging: 'text-text-warning',
  due_today: 'text-text-info',
};

/** What a flag says about the record, in the unfolded facts. */
const FLAG_LABEL: Readonly<Record<LiveFeedItemFlag, string>> = {
  noCarrierScan: 'No carrier scan yet',
  pickup: 'Local pickup',
};

export interface LiveFeedTicketProps {
  item: LiveFeedItem;
  rowId: number;
  now: number | null;
  expanded: boolean;
  /** This row's record is open in the split pane. */
  open: boolean;
  /** The board's keyboard cursor sits here — the row's face is the lane's tab stop. */
  cursor: boolean;
  onToggle: (item: LiveFeedItem) => void;
  onOpen: (item: LiveFeedItem) => void;
  onCopy: (item: LiveFeedItem) => void;
  onFocusRow: (item: LiveFeedItem) => void;
}

export const LiveFeedTicket = memo(function LiveFeedTicket({
  item,
  rowId,
  now,
  expanded,
  open,
  cursor,
  onToggle,
  onOpen,
  onCopy,
  onFocusRow,
}: LiveFeedTicketProps) {
  const status = getLiveFeedStatus(item.statusId);
  const line = liveFeedProduct(item);
  const identity = liveFeedTicketIdentity(item);
  const carrier = item.carrier ? displayCarrierFromHint(item.carrier) : null;
  const qty = item.line?.qty ?? 1;
  const staffed = status.staffLabel != null && item.staffName != null;

  return (
    <li className="group/ticket relative border-b border-mode-rule" data-ticket={rowId} data-desk-record-key={rowId}>
      <button
        type="button"
        tabIndex={cursor ? 0 : -1}
        aria-expanded={expanded}
        aria-label={`${identity}, ${line.title}`}
        data-ticket-face=""
        onClick={() => onToggle(item)}
        onFocus={() => onFocusRow(item)}
        className={cn(
          'flex h-11 w-full flex-col justify-center gap-0.5 px-3 text-left transition-colors',
          open ? 'bg-surface-accent ring-1 ring-inset ring-border-accent' : expanded ? 'bg-mode-well' : 'hover:bg-mode-hover',
          focusRing('control'),
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn('min-w-8 shrink-0 whitespace-nowrap text-role-caption tabular-nums', item.urgency ? URGENCY_TEXT[item.urgency] : 'text-text-muted')}
          >
            {liveFeedTicketWhen(item, status.kind, now)}
          </span>
          <span className="min-w-0 truncate font-mono text-role-data text-text-default">{identity}</span>
          {carrier ? (
            <span className="ml-auto shrink-0 text-role-micro text-text-muted">{CARRIER_BRANDS[carrier].label}</span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">{line.title}</span>
          {qty > 1 ? <span className="shrink-0 text-role-caption tabular-nums text-text-muted">×{qty}</span> : null}
          {staffed ? <StaffAvatar staffId={item.staffId} name={item.staffName} size="xs" face="record" ring={false} /> : null}
        </span>
      </button>

      {item.tracking ? (
        <span className="absolute right-2 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/ticket:opacity-100">
          <HoverTooltip label={item.tracking} shortcut="C" asChild>
            <IconButton
              size="xs"
              radius="control"
              tabIndex={-1}
              icon={<Copy className="size-3.5" aria-hidden />}
              ariaLabel={`Copy tracking ${item.tracking}`}
              onClick={() => onCopy(item)}
              className="bg-surface-card"
            />
          </HoverTooltip>
        </span>
      ) : null}

      <Collapse open={expanded} className="flex gap-3 px-3 pb-3 pt-1">
        <PhotoHoverPeek
          src={line.photoUrl}
          alt={line.title}
          className="relative size-12 shrink-0 overflow-hidden rounded-mode-control bg-mode-well"
        >
          <RecordPhoto src={line.photoUrl} fallback={line.title} />
        </PhotoHoverPeek>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-role-data text-text-default">{line.title}</p>
          {item.flags.length > 0 ? (
            <p className="text-role-caption text-text-warning">{item.flags.map((flag) => FLAG_LABEL[flag]).join(' · ')}</p>
          ) : null}
          <TicketFacts item={item} />
          {item.tracking ? <TrackingChip value={item.tracking} carrierHint={item.carrier} dense /> : null}
          <p className="text-role-caption text-text-muted">
            {staffed ? `${status.staffLabel} ${item.staffName} · ` : ''}
            {item.at ? `${formatDateTimePST(item.at)} PT` : 'Time not recorded'}
          </p>
          {item.trail ? <TicketTrail trail={item.trail} /> : null}
          <div>
            <HotkeyTooltip action="Open the record beside the board" chord="O">
              <Button type="button" variant="secondary" size="sm" icon={<ExternalLink aria-hidden />} onClick={() => onOpen(item)}>
                Open record
              </Button>
            </HotkeyTooltip>
          </div>
        </div>
      </Collapse>
    </li>
  );
});

/** Condition (its grade's tone) · price · qty, whichever the record has. */
function TicketFacts({ item }: { item: LiveFeedItem }) {
  const condition = lineCondition({ condition: item.line?.condition });
  const qty = item.line?.qty ?? null;
  if (!condition.label && !item.line?.price && !(qty && qty > 1)) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-role-caption tabular-nums text-text-muted">
      {condition.label ? <span className={conditionGradeTextClass(condition.code)}>{condition.label}</span> : null}
      {item.line?.price ? <span className="text-text-default">{item.line.price}</span> : null}
      {qty && qty > 1 ? <span>×{qty}</span> : null}
    </p>
  );
}

/** Packed → Scanned out → With carrier → Delivered, with the times that exist. */
function TicketTrail({ trail }: { trail: LiveFeedTrail }) {
  return (
    <ol aria-label="Stage trail" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-role-micro">
      {TRAIL_STEPS.map((step, index) => {
        const at = trail[step.key];
        return (
          <li key={step.key} className={cn('flex items-center gap-1.5 whitespace-nowrap', at ? 'text-text-default' : 'text-text-faint')}>
            {index > 0 ? <span aria-hidden>→</span> : null}
            <span>{step.label}</span>
            {at ? <span className="tabular-nums text-text-muted">{formatMonthDayTimePST(at)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}