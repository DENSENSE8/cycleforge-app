'use client';

/**
 * Labels & docs › Orders — one order as a `TriageRow` (`label-intake.orders`):
 *
 *   ☐ ▸ [Missing | Ready | Printed] · platform mark + order (last 8) ·
 *   [label][slip][paperwork n/m] · lead product · gaps · ship-by · Printed ×N
 *
 * The slot strip is the order's shape at a glance (foundation 2: gaps read
 * without opening): every slot is exactly one of Filled ✓ · Missing ✗ ·
 * Needs review ! · Not required –; product paperwork counts its filled lines
 * over the lines that need it. The chevron folds the order's lines under the
 * row (`OrderPacketLines`), each with the same line-slot control as the pane.
 */

import { AlertCircle, Check, FileText, Minus, Receipt, ShippingModeLabels, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { RecordFactPaint } from '@/design-system/components/record-card/record-fact';
import type { TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import type { RecordStateFace } from '@/design-system/tokens/record';
import {
  ORDER_PACKET_GAP_LABEL,
  ORDER_PACKET_STATUS_LABEL,
  type OrderPacket,
  type OrderPacketGap,
  type OrderPacketStatus,
  type PacketSlotState,
} from '@/lib/label-prints/order-packet-contracts';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { outboundOrderIdentity } from '@/lib/operational-identity';
import type { OrderChannelResolver } from '@/lib/platform-display';
import { getDaysLateNullable, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { LinePaperworkSlot } from './pane/LinePaperworkSlot';
import { SLOT_STATE_FACE, printedFace } from './pane/slot-faces';

const STATUS_FACE: Readonly<Record<OrderPacketStatus, RecordStateFace>> = {
  missing: { id: 'missing', code: 'MIS', label: ORDER_PACKET_STATUS_LABEL.missing, tone: 'danger', icon: 'package-x' },
  ready: { id: 'ready', code: 'RDY', label: ORDER_PACKET_STATUS_LABEL.ready, tone: 'info', icon: 'circle-dot' },
  printed: { id: 'printed', code: 'PRT', label: ORDER_PACKET_STATUS_LABEL.printed, tone: 'success', icon: 'check' },
};

const SLOT_GLYPH: Readonly<Record<OrderPacketGap, typeof FileText>> = {
  label: ShippingModeLabels,
  slip: Receipt,
  paperwork: FileText,
};

const STATE_MARK: Readonly<Record<PacketSlotState, { Glyph: typeof Check; ink: string }>> = {
  filled: { Glyph: Check, ink: 'text-text-success' },
  missing: { Glyph: X, ink: 'text-text-danger' },
  review: { Glyph: AlertCircle, ink: 'text-text-warning' },
  not_required: { Glyph: Minus, ink: 'text-mode-faint' },
};

/** Product paperwork over the order's lines: the worst line's state, and filled / lines that need it. */
export function paperworkSlot(packet: Pick<OrderPacket, 'lines'>): { state: PacketSlotState; filled: number; needed: number } {
  const needed = packet.lines.filter((line) => line.state !== 'not_required');
  const filled = needed.filter((line) => line.state === 'filled').length;
  const state: PacketSlotState =
    needed.length === 0
      ? 'not_required'
      : needed.some((line) => line.state === 'missing')
        ? 'missing'
        : needed.some((line) => line.state === 'review')
          ? 'review'
          : 'filled';
  return { state, filled, needed: needed.length };
}

function SlotCell({ slot, state, count }: { slot: OrderPacketGap; state: PacketSlotState; count?: string }) {
  const Glyph = SLOT_GLYPH[slot];
  const { Glyph: Mark, ink } = STATE_MARK[state];
  const said = `${ORDER_PACKET_GAP_LABEL[slot]}: ${SLOT_STATE_FACE[state].label}${count ? ` (${count})` : ''}`;
  return (
    <HoverTooltip label={said} asChild focusable={false}>
      <span
        role="img"
        aria-label={said}
        data-slot={slot}
        data-slot-state={state}
        className="pointer-events-auto inline-flex h-6 min-w-11 items-center gap-0.5 rounded-md bg-mode-well px-1.5 text-role-caption tabular-nums"
      >
        <Glyph className="size-3.5 text-mode-muted" aria-hidden />
        {count && state !== 'not_required' ? <span className={cn('font-semibold', ink)}>{count}</span> : <Mark className={cn('size-3.5', ink)} aria-hidden />}
      </span>
    </HoverTooltip>
  );
}

/** The three slots, always in the same order: Shipping label · Packing slip · Product paperwork. */
export function PacketSlotStrip({ packet }: { packet: OrderPacket }) {
  const paperwork = paperworkSlot(packet);
  return (
    <span className="flex items-center gap-1" data-testid="order-packet-slot-strip">
      <SlotCell slot="label" state={packet.label.state} />
      <SlotCell slot="slip" state={packet.slip.state} />
      <SlotCell slot="paperwork" state={paperwork.state} count={`${paperwork.filled}/${paperwork.needed}`} />
    </span>
  );
}

/** One order as `TriageRow` data — the card-view adapter for `label-intake.orders`. */
export function orderPacketRowFace(packet: OrderPacket, channel: OrderChannelResolver): TriageRowFace {
  const state = STATUS_FACE[packet.status];
  const lead = packet.lines[0];
  const more = packet.lines.length - 1;
  const title = lead ? (more > 0 ? `${lead.title} +${more} more` : lead.title) : 'No product lines';
  const shipByKey = packet.shipByAt ? toPSTDateKey(packet.shipByAt) : null;
  const late = packet.shipByAt ? (getDaysLateNullable(packet.shipByAt) ?? 0) : 0;
  const shipBy = formatShipByFace(shipByKey, late);
  const gaps = packet.gapCount === 0 ? 'No gaps' : `${packet.gapCount} ${packet.gapCount === 1 ? 'gap' : 'gaps'}`;
  const printed = printedFace(packet.printCount);
  const paperwork = paperworkSlot(packet);
  return {
    state,
    identity: outboundOrderIdentity(packet.orderRef, channel(packet.orderRef, packet.accountSource)),
    identityWidth: 'code',
    strip: <PacketSlotStrip packet={packet} />,
    title,
    titleTip: [
      `Order ${packet.orderRef}`,
      ...packet.lines.map((line) => `${line.title} ×${line.quantity}`),
      `${ORDER_PACKET_GAP_LABEL.label}: ${SLOT_STATE_FACE[packet.label.state].label}`,
      `${ORDER_PACKET_GAP_LABEL.slip}: ${SLOT_STATE_FACE[packet.slip.state].label}`,
      `${ORDER_PACKET_GAP_LABEL.paperwork}: ${paperwork.filled}/${paperwork.needed}`,
      `Ship by ${shipBy}`,
      printed,
    ].join(' · '),
    facts: [
      { id: 'gaps', value: gaps, width: 'short', tone: packet.gapCount > 0 ? 'warn' : 'muted' },
      { id: 'ship-by', value: shipBy, width: 'short', tone: late > 0 ? 'warn' : 'muted', tip: packet.shipByAt ? `Ship by ${shipBy}` : 'No ship-by date' },
      { id: 'printed', value: printed, width: 'short', tone: 'muted' },
    ],
    next: null,
    aria: {
      row: `Order ${packet.orderRef}, ${state.label}, ${gaps}`,
      open: `Open order ${packet.orderRef}`,
      check: `Select order ${packet.orderRef}`,
    },
  };
}

/** The order's lines folded under its row: photo · title · quantity · SKU, then the line's paperwork slot. */
export function OrderPacketLines({ packet }: { packet: OrderPacket }) {
  if (packet.lines.length === 0) return <p className="py-1 text-role-caption text-mode-muted">This order has no product lines.</p>;
  return (
    <ul className="flex flex-col divide-y divide-mode-divide" data-testid="order-packet-lines">
      {packet.lines.map((line) => (
        <li key={line.orderLineId} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-order-line-id={line.orderLineId}>
          <PhotoHoverPeek
            src={line.photoUrl}
            alt={line.title}
            className={cn('block size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-mode-rule', line.photoUrl ? 'bg-surface-card' : 'bg-mode-well')}
          >
            {line.photoUrl ? <img src={line.photoUrl} alt="" loading="lazy" className="size-full object-cover" /> : null}
          </PhotoHoverPeek>
          <span className="min-w-40 flex-1 truncate text-role-body text-mode-ink" title={line.title}>
            {line.title}
          </span>
          <span className="shrink-0">
            <RecordFactPaint face={{ kind: 'qty', value: line.quantity, multiplier: 'always' }} />
          </span>
          {line.sku ? (
            <span className="shrink-0">
              <RecordFactPaint face={{ kind: 'code', text: line.sku, title: `SKU ${line.sku}` }} />
            </span>
          ) : null}
          <span className="flex min-w-0 shrink-0 items-center">
            <LinePaperworkSlot packet={packet} line={line} placement="row" />
          </span>
        </li>
      ))}
    </ul>
  );
}
