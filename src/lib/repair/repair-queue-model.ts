/**
 * Pure repair-queue projections shared by the desktop table, its filters and
 * the record surface: public handles, title, SLA, day grouping and queue sort.
 */

import type { RecordCardDeadline } from '@/design-system/components/record-card/record-card-types';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { orderCardSla } from '@/lib/orders/order-card-model';
import { ordersShipByDelay } from '@/lib/orders/orders-compound-view';
import { REPAIR_CLOSED_FACE } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { REPAIR_SLA_BUSINESS_DAYS } from '@/lib/repair/repair-due-at';
import { isRsDisplayCode } from '@/lib/repair/repair-paper-ticket';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
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

/** Price display — free text prefixed with `$`; empty stays absent. */
export function repairPriceDisplay(repair: Pick<RSRecord, 'price'>): string | null {
  const raw = String(repair.price || '').trim();
  if (!raw) return null;
  return raw.startsWith('$') ? raw : `$${raw}`;
}

/** Numeric price for sorting (parsed from the free-text value; 0 when absent). */
export function repairPriceSortValue(repair: Pick<RSRecord, 'price'>): number {
  const cleaned = String(repair.price || '').replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** The operator's next useful repair verb; shared by list and record faces. */
export function repairNextAction(status: string | null | undefined): { label: string; blocked: boolean } | null {
  switch ((status || '').trim()) {
    case 'Incoming Shipment':
      return { label: 'Receive', blocked: true };
    case 'Pending Repair':
      return { label: 'Repair', blocked: false };
    case 'Awaiting Parts':
      return { label: 'Receive parts', blocked: true };
    case 'Awaiting Additional Parts Payment':
      return { label: 'Collect parts payment', blocked: true };
    case 'Repaired, Contact Customer':
      return { label: 'Contact customer', blocked: false };
    case 'Awaiting Payment':
      return { label: 'Collect payment', blocked: true };
    case 'Awaiting Pickup':
      return { label: 'Hand off', blocked: false };
    default:
      return null;
  }
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


// ── Sort — the order `?sort=` (vocabulary: `repair-sort.ts`) puts rows in ──

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
