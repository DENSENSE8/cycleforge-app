/**
 * The REPAIR CARD's facts — one repair ticket (`RSRecord`) → what the triage
 * card paints (`RecordCardModel`, owner 2026-09-29). Pure: the host
 * (`RepairCardList`) hands the result to the house `RecordCard` face.
 *
 * Line 1 — identity: the Zendesk ticket (the one identifier; the internal
 * `RS-{id}` never paints) and the carton `R-{id}` when the drop-off ticket was
 * received, the channel it came through, the customer; the status (the
 * card's inline status control) and the SLA top-right, in the orders' ladder.
 * Line 2 — the product (title, catalog photo when there is one).
 * Line 3 — facts: issue · price · received / opened · received by; the serial
 * bottom-right, where the orders' next step sits.
 */

import type { RecordCardDeadline, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import type { RecordFactFace } from '@/design-system/components/record-card/record-fact';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import { repairStatusFace } from '@/design-system/tokens/repair-status';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { orderCardSla } from '@/lib/orders/order-card-model';
import { ordersShipByDelay } from '@/lib/orders/orders-compound-view';
import { REPAIR_CLOSED_FACE, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { REPAIR_CHANNEL_LABEL, parseRepairChannel, type RepairChannel } from '@/lib/repair/repair-channel';
import { REPAIR_SLA_BUSINESS_DAYS } from '@/lib/repair/repair-due-at';
import { isRsDisplayCode } from '@/lib/repair/repair-paper-ticket';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { repairPriceDisplay, repairPriceSortValue } from '@/lib/repair/repair-queue-model';
import type { RepairSort } from '@/lib/repair/repair-sort';
import { diffDaysDateKey, formatDateKeyShort, formatMonthDayTimePST, toPSTDateKey } from '@/utils/date';

/** How the triage chrome and the verbs name a repair. */
export const REPAIR_NOUN = { one: 'repair', many: 'repairs' } as const;

/** The handles on line 1, in the order they paint. */
export interface RepairHandles {
  /** The Zendesk ticket number without `#`; null when the row only has its internal RS- code. */
  ticket: string | null;
  /** The carton sticker when the drop-off ticket became a receiving line. */
  carton: string | null;
}

/** The card the triage face keys, opens and selects — one per repair ticket. */
export interface RepairCardModel {
  key: string;
  ids: readonly number[];
  lead: RSRecord;
  handles: RepairHandles;
  customer: string | null;
  channel: RepairChannel | null;
  /** The serial — a code fact at the card's bottom-right. */
  serial: RecordFactFace;
  record: RecordCardModel;
}

/** Ticket without `#`, or null for an empty / internal RS- code. */
export function repairTicketHandle(repair: Pick<RSRecord, 'ticket_number'>): string | null {
  const raw = String(repair.ticket_number ?? '').trim().replace(/^#/, '').trim();
  return raw && !isRsDisplayCode(raw) ? raw : null;
}

export function repairHandles(repair: Pick<RSRecord, 'ticket_number' | 'receiving_line_id' | 'receiving_id'>): RepairHandles {
  const linked = repair.receiving_line_id != null && repair.receiving_id != null;
  return {
    ticket: repairTicketHandle(repair),
    carton: linked ? `R-${repair.receiving_id}` : null,
  };
}

export function repairTitle(repair: Pick<RSRecord, 'product_title' | 'source_sku'>): string {
  const sku = String(repair.source_sku ?? '').trim() || null;
  return resolveSkuIdentityTitle({ item_name: repair.product_title, sku }) || 'Unnamed device';
}

/** When the ticket reached its closing status — the latest history entry into it, else its last update. */
function closedAt(repair: RSRecord): string | null {
  const history = repair.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.status === repair.status) return history[i]!.timestamp || null;
  }
  return repair.updated_at || null;
}

/**
 * The SLA top-right, worded and toned by the orders' ladder (`orderCardSla`:
 * N d late · Due today · Tomorrow · the date). A closed ticket reads when it
 * closed with no pressure; a box still on Incoming Shipment has no due date.
 */
export function repairSla(repair: RSRecord, todayKey: string): RecordCardDeadline {
  const status = (repair.status || '').trim();
  const closed = REPAIR_CLOSED_FACE[status];
  if (closed) {
    const at = closedAt(repair);
    const key = at ? toPSTDateKey(at) : '';
    return key
      ? { face: `${closed} ${formatDateKeyShort(key)}`, tone: 'none', tip: `${closed} ${formatMonthDayTimePST(at)} — no due date once closed` }
      : { face: closed, tone: 'none', tip: null };
  }
  const due = (repair.due_at || '').trim();
  const dueKey = due ? toPSTDateKey(due) : '';
  if (status === 'Incoming Shipment' || !dueKey) {
    return {
      face: 'No due date',
      tone: 'none',
      tip: status === 'Incoming Shipment' ? `Not received yet — due ${REPAIR_SLA_BUSINESS_DAYS} business days after it arrives` : null,
    };
  }
  const late = Math.max(0, diffDaysDateKey(dueKey, todayKey) ?? 0);
  const from = repair.received_at ? 'received' : 'opened';
  return orderCardSla(
    ordersShipByDelay({ deadline_at: due, ship_by_date: null }, late, todayKey),
    `Due ${formatMonthDayTimePST(due)} — ${REPAIR_SLA_BUSINESS_DAYS} business days after it was ${from}`,
  );
}

/** The date the card reads: received on the bench, else when the ticket was opened. */
function repairDateFact(repair: RSRecord): RecordFactFace | null {
  // A box still marked Incoming Shipment is not on the bench yet, whatever the stamp says.
  const received = repair.status === 'Incoming Shipment' ? '' : (repair.received_at || '').trim();
  const created = (repair.created_at || '').trim();
  const source = received || created;
  const key = source ? toPSTDateKey(source) : '';
  if (!key) return null;
  const verb = received ? 'Received' : 'Opened';
  return { kind: 'date', text: `${verb} ${formatDateKeyShort(key)}`, title: `${verb} ${formatMonthDayTimePST(source)}` };
}

/** The fact columns the repair card's line reads, in order (`REPAIR_QUEUE_VIEW.facts`): the issue leads. */
export function repairLineFacts(
  repair: RSRecord,
  staffName?: (id: number) => string | null,
): Readonly<Record<string, RecordFactFace | null>> {
  const issue = String(repair.issue ?? '').replace(/\s+/g, ' ').trim();
  const price = repairPriceDisplay(repair);
  const receiver = repair.received_by_staff_id != null ? staffName?.(repair.received_by_staff_id) ?? null : null;
  return {
    issue: issue ? { kind: 'text', text: issue.length > 80 ? `${issue.slice(0, 79)}…` : issue } : null,
    price: { kind: 'money', text: price, estimate: false, estimateTitle: '' },
    date: repairDateFact(repair),
    staff: receiver ? { kind: 'text', text: `By ${receiver}` } : null,
  };
}

/**
 * One repair's card. `todayKey` is the warehouse's PT day the SLA reads
 * against; `staffName` names the staffer who received it (the wire sends only
 * the id) — null / absent = the fact is left off.
 */
export function repairCardModel(repair: RSRecord, todayKey: string, staffName?: (id: number) => string | null): RepairCardModel {
  const handles = repairHandles(repair);
  const customer = resolveRepairContact(repair).name;
  const channel = parseRepairChannel(repair.intake_channel);
  const state = repairStatusFace(repair.status);
  const statusFace = repairStatusOperatorLabel(state.label);
  const title = repairTitle(repair);
  const serial = String(repair.serial_number ?? '').trim();
  // "#10089 · R-812" — the card's accessible / spoken name.
  const name = [handles.ticket ? `#${handles.ticket}` : null, handles.carton].filter(Boolean).join(' · ') || title;
  return {
    key: `repair:${repair.id}`,
    ids: [repair.id],
    lead: repair,
    handles,
    customer,
    channel,
    serial: serial ? { kind: 'code', text: serial, title: 'Serial number' } : { kind: 'missing', text: 'No serial' },
    record: {
      key: `repair:${repair.id}`,
      leadId: repair.id,
      state,
      stateIcon: recordStateGlyph(state),
      stateMeaning: statusFace,
      alert: null,
      aria: {
        card: `Repair ${name}, ${statusFace}, ${title}`,
        open: `Open repair ${name}`,
        check: `Select repair ${name}`,
      },
      // The dot is the host's (a glyph node); the adapter stays pure data.
      channel: channel
        ? { label: REPAIR_CHANNEL_LABEL[channel], tooltip: `${REPAIR_CHANNEL_LABEL[channel]} — how the device reached us`, dot: null, badge: null }
        : null,
      person: customer,
      chips: [],
      notes: { fixed: null, own: null },
      status: { kind: 'deadline', ...repairSla(repair, todayKey) },
      // The serial holds the bottom-right; the status control says where the ticket stands.
      next: null,
      lines: [
        {
          id: repair.id,
          title,
          photoUrl: (repair.image_url || '').trim() || null,
          facts: repairLineFacts(repair, staffName),
          alert: false,
          alertNote: null,
        },
      ],
      hiddenAlertLabel: () => '',
    },
  };
}

// ── Sort — the order `?sort=` (vocabulary: `repair-sort.ts`) puts the cards in ─

/** Workflow order — the Status sort walks the bench left to right. */
const STATUS_ORDER = [
  'Incoming Shipment',
  'Pending Repair',
  'Awaiting Parts',
  'Awaiting Additional Parts Payment',
  'Repaired, Contact Customer',
  'Awaiting Payment',
  'Awaiting Pickup',
  'Shipped',
  'Picked Up',
  'Done',
  'Cancelled',
];

function statusRank(status: string | null | undefined): number {
  const index = STATUS_ORDER.indexOf((status || '').trim());
  return index === -1 ? STATUS_ORDER.length : index;
}

const createdMs = (repair: RSRecord) => {
  const ms = Date.parse(repair.created_at || '');
  return Number.isFinite(ms) ? ms : 0;
};

/** Text A→Z with blanks last. */
function byText(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Two repairs in the sort's order; ties fall back to newest first, then the id. */
export function compareRepairs(a: RSRecord, b: RSRecord, sort: RepairSort): number {
  const newest = createdMs(b) - createdMs(a) || b.id - a.id;
  switch (sort) {
    case 'newest':
      return newest;
    case 'oldest':
      return -newest;
    case 'status':
      return statusRank(a.status) - statusRank(b.status) || newest;
    case 'ticket':
      return byText(repairTicketHandle(a), repairTicketHandle(b)) || a.id - b.id;
    case 'customer':
      return byText(resolveRepairContact(a).name, resolveRepairContact(b).name) || newest;
    case 'product':
      return byText(repairTitle(a), repairTitle(b)) || newest;
    case 'price_high':
      return repairPriceSortValue(b) - repairPriceSortValue(a) || newest;
  }
}

/** The day a dated sort bands a repair under (PT civil day it was opened); '' = undated. */
export function repairDayKey(repair: RSRecord): string {
  return repair.created_at ? toPSTDateKey(repair.created_at) : '';
}
