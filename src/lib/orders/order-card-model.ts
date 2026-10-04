/**
 * The ORDER CARD's facts — one order (all its lines) → what the triage card
 * paints at a glance (owner 2026-09-27, BRIEF §13). Pure: no React, no classes.
 *
 * - `state` is the worst line's lifecycle state (the rail and the status icon).
 * - `lines` lead with the out-of-stock lines, so the card's first product is
 *   the one that blocks the order.
 * - `sla` is the order's earliest deadline, worded for the top-right corner.
 */

import type { ShippedOrder } from '@/types/orders';
import { LIFECYCLE, type LifecycleState, type StateName } from '@/design-system/tokens/lifecycle';
import { recordState, worstState } from '@/components/outbound/orders/outbound-orders-ledger-state';
import { conditionSentenceLabel } from '@/lib/conditions';
import { ordersLineTitle, resolveOrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import type { Delay } from '@/lib/tables/field-catalog/slot-value';
import { formatCurrency } from '@/utils/_number';
import { getExternalUrlByItemNumber, listingMatchesOrderPlatform } from '@/utils/external-item-url';
import { getOrderPlatformLabel, orderAdminUrl } from '@/utils/order-platform';
import { orderStage, type OrderStage } from '@/lib/orders/order-stages';
import { customerFullName } from '@/lib/customers/customer-display';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import { marketplaceThumbUrl } from '@/lib/photos/marketplace-thumb-url';
import type { RecordCardLine } from '@/design-system/components/record-card/record-card-types';
import { ordersGroupEdgeMark } from '@/lib/orders/orders-compound-view';

/** The order's urgent word across its lines — the same one the desk rail paints. */
function ordersUrgentWord(rows: readonly ShippedOrder[]): string | null {
  const mark = ordersGroupEdgeMark(rows);
  return mark?.kind === 'urgent' ? mark.label : null;
}

export interface OrderCardLine {
  record: ShippedOrder;
  id: number;
  title: string;
  thumbUrl: string | null;
  qty: number;
  /** Sentence-case grade ("Used – Good"); null when the channel sent none. */
  condition: string | null;
  /** Raw grade code — the tone reads it. */
  conditionCode: string | null;
  price: string | null;
  priceEstimate: boolean;
  outOfStock: boolean;
  /** Why it is short ("2 short · Brake lever"), when the report named it. */
  shortNote: string | null;
  state: LifecycleState;
  /**
   * This line's own Pick and QC, read from its own row (Pick is
   * {@link OrderStage.blocked} when the line is out of stock). Pack is the
   * order's — see {@link OrderCardModel.pack}.
   */
  stages: { pick: OrderStage; qc: OrderStage };
}

export type OrderCardSlaTone = 'late' | 'today' | 'soon' | 'later' | 'none';

export interface OrderCardSla {
  face: string;
  tone: OrderCardSlaTone;
  tip: string | null;
}

export interface OrderCardModel {
  key: string;
  ids: number[];
  lead: ShippedOrder;
  lines: OrderCardLine[];
  state: LifecycleState;
  orderId: string;
  accountSource: string | null;
  /** The operator-set admin link (`orders.admin_url`), when one is stored. */
  adminUrl: string | null;
  /** Where the order's ↗ goes: {@link adminUrl}, else the derived marketplace URL. Null → the card offers "Add link". */
  orderHref: string | null;
  fba: boolean;
  /** Counter pickup (`fulfillment_channel = 'PICKUP'`) — no label is coming, and none is owed. */
  pickup: boolean;
  sla: OrderCardSla;
  /** Units across every line. */
  units: number;
  outOfStockCount: number;
  urgent: boolean;
  /** Why it is urgent ("Next day", "2-day → Ground", "Urgent"); null when not urgent. */
  urgentLabel: string | null;
  buyerNote: string | null;
  /** The staff note on the order (`orders.notes`), when one is written. */
  staffNote: string | null;
  /** Linked customer's name, else the ShipStation ship-to name / company. Null when neither. */
  buyerName: string | null;
  /** The shown product's marketplace listing — item number, else SKU (the To-ship listing rule). */
  listingHref: string | null;
  /** The item number (or SKU) {@link listingHref} was built from. */
  listingItem: string | null;
  /** False when {@link listingHref} lands on another platform's storefront than the order's (an eBay order → Ecwid search). */
  listingMatchesOrder: boolean;
  /** Pack — once per order (one box), read from the lead row. */
  pack: OrderStage;
  /**
   * The order-level Pick → QC → Pack reading (quick look, record, "where is it
   * now"): Pick / QC are the first line still waiting on that stage (else the
   * shown line's), Pack is {@link pack}. Always all three, in that order.
   */
  stages: readonly OrderStage[];
  /** The next workflow step (Pick → Pack → Scan out); null once shipped. */
  next: OrderNextStep | null;
}

/** Where the order goes next — the card's bottom-right. */
export interface OrderNextStep {
  /** The next verb, present tense: "Pick" · "Pack" · "Scan out" (pickup: "Hand over"). */
  label: string;
  tone: StateName;
  tip: string;
  /** Pick cannot run: a line is out of stock. */
  blocked: boolean;
}

/** A line's price in its currency; `estimate` when it came from the listing, not the sale. Cards and the ledger share it. */
export function linePrice(
  line: Pick<ShippedOrder, 'sale_amount' | 'currency' | 'price_currency' | 'price_cents' | 'price_is_estimate'>,
): { text: string | null; estimate: boolean } {
  const currency = String(line.currency || line.price_currency || 'USD').trim().toUpperCase();
  const format = (amount: number) => {
    try {
      return formatCurrency(amount, currency);
    } catch {
      return formatCurrency(amount);
    }
  };
  const sale = Number(line.sale_amount);
  if (line.sale_amount != null && line.sale_amount !== '' && Number.isFinite(sale)) {
    return { text: format(sale), estimate: false };
  }
  if (typeof line.price_cents === 'number') {
    return { text: format(line.price_cents / 100), estimate: line.price_is_estimate === true };
  }
  return { text: null, estimate: false };
}

/** A line's grade: sentence-case label + raw code (the tone reads it); both null when the channel sent none. */
export function lineCondition(line: { condition?: string | null }): { label: string | null; code: string | null } {
  const code = String(line.condition ?? '').trim().toUpperCase();
  if (!code || code === 'N/A') return { label: null, code: null }; // ds-allow-na: marketplace empty-vocab reader
  return { label: conditionSentenceLabel(code), code };
}

function shortNote(line: ShippedOrder): string | null {
  if (!line.is_out_of_stock) return null;
  const short = Number(line.oos_qty_short);
  const parts = [
    Number.isFinite(short) && short > 0 ? `${short} short` : null,
    String(line.oos_title ?? '').trim() || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function orderCardLine(line: ShippedOrder, todayKey: string, staffName?: (id: number) => string): OrderCardLine {
  const condition = lineCondition(line);
  const price = linePrice(line);
  const qty = Number(line.quantity);
  const outOfStock = line.is_out_of_stock === true;
  return {
    record: line,
    id: Number(line.id),
    title: ordersLineTitle(line),
    thumbUrl: marketplaceThumbUrl(line.catalog_image_url),
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    condition: condition.label,
    conditionCode: condition.code,
    price: price.text,
    priceEstimate: price.estimate,
    outOfStock,
    shortNote: shortNote(line),
    state: recordState(line),
    stages: {
      pick: orderStage(line, 'pick', { todayKey, staffName, outOfStock }),
      qc: orderStage(line, 'qc', { todayKey, staffName }),
    },
  };
}

/** An order line's facts — qty · condition · price — keyed by the order views' fact columns (To ship and Shipped alike). */
export function orderLineFacts(
  line: Pick<OrderCardLine, 'qty' | 'condition' | 'conditionCode' | 'price' | 'priceEstimate'>,
): RecordCardLine['facts'] {
  return {
    qty: { kind: 'qty', value: line.qty, multiplier: 'multiple' },
    condition: line.condition ? { kind: 'grade', label: line.condition, code: line.conditionCode } : null,
    price: line.price ? { kind: 'money', text: line.price, estimate: line.priceEstimate, estimateTitle: 'Estimate from the listing price' } : null,
  };
}

/** An order line as a record-card line — the facts every order card face paints (qty · condition · price). */
export function orderRecordLine(line: OrderCardLine): RecordCardLine {
  return {
    id: line.id,
    title: line.title,
    photoUrl: line.thumbUrl,
    alert: line.outOfStock,
    alertNote: line.shortNote,
    facts: orderLineFacts(line),
  };
}

/** The deadline, worded for the card's top-right corner. */
export function orderCardSla(delay: Delay, tip: string | null): OrderCardSla {
  const day = delay.dateLabel ?? null;
  if (!day) return { face: 'No ship-by', tone: 'none', tip };
  if (delay.overdue && delay.days > 0) {
    return { face: `${delay.days}d late · ${day}`, tone: 'late', tip };
  }
  if (delay.dueToday) return { face: 'Due today', tone: 'today', tip };
  if (delay.daysUntil === 1) return { face: 'Tomorrow', tone: 'soon', tip };
  return { face: day, tone: 'later', tip };
}

/** The order's SLA — its earliest deadline across `rows`, worded and toned. */
export function orderSla(rows: readonly ShippedOrder[], todayKey: string): OrderCardSla {
  const deadline = resolveOrdersIndexValue(rows, 'orders.fulfill_by', { todayKey });
  return deadline?.kind === 'deadline'
    ? orderCardSla(deadline.delay, deadline.tip)
    : { face: 'No ship-by', tone: 'none', tip: null };
}

/**
 * Ship-by section order: Late · Due today · Tomorrow · Later · No ship-by.
 * The list's sections, its pages and J / K all follow it.
 */
export const ORDER_SLA_SECTIONS: readonly OrderCardSlaTone[] = ['late', 'today', 'soon', 'later', 'none'];

/**
 * The order's next step on the floor: Pick → Pack → Scan out (a counter pickup
 * is handed over instead). QC is a unit fact, not order work, so it never
 * stands between Picked and Packed here. The latest done stage wins — a packed
 * order is waiting on its scan-out even when its pick went unrecorded.
 */
export function orderNextStep(
  state: LifecycleState,
  stages: { pick: OrderStage; pack: OrderStage },
  pickup: boolean,
): OrderNextStep | null {
  if (state === 'shipped') return null;
  const assigned = (stage: OrderStage) => (stage.who ? ` — assigned to ${stage.who}` : '');
  if (stages.pack.done) {
    return pickup
      ? { label: 'Hand over', tone: LIFECYCLE.shipped.tone, tip: 'Next: hand it to the customer at the counter', blocked: false }
      : { label: 'Scan out', tone: LIFECYCLE.shipped.tone, tip: 'Next: scan it out at the dock', blocked: false };
  }
  if (stages.pick.done) {
    return { label: 'Pack', tone: LIFECYCLE.packed.tone, tip: `Next: pack it${assigned(stages.pack)}`, blocked: false };
  }
  const blocked = stages.pick.blocked != null;
  return {
    label: 'Pick',
    tone: LIFECYCLE.picked.tone,
    tip: blocked ? 'Next: pick it — blocked, a line is out of stock' : `Next: pick it${assigned(stages.pick)}`,
    blocked,
  };
}

/** How the triage chrome and the verb reasons name an order. */
export const ORDER_NOUN = { one: 'order', many: 'orders' } as const;

/**
 * One order's card. `rows` is every line of the order, in display order.
 * `staffName` names a pick / pack actor the wire sent only as an id.
 */
export function orderCardModel(
  key: string,
  rows: readonly ShippedOrder[],
  todayKey: string,
  staffName?: (id: number) => string,
): OrderCardModel {
  const lead = rows[0]!;
  const built = rows.map((row) => orderCardLine(row, todayKey, staffName));
  // Out-of-stock lines first; otherwise keep the feed's order.
  const lines = [...built.filter((l) => l.outOfStock), ...built.filter((l) => !l.outOfStock)];
  const sla = orderSla(rows, todayKey);
  const buyerNote = rows.map((r) => String(r.buyer_note ?? '').trim()).find(Boolean) ?? null;
  const staffNote = rows.map((r) => String(r.notes ?? '').trim()).find(Boolean) ?? null;
  const shipTo = lead.shipstation_ship_to;
  const buyerName =
    (lead.customer ? customerFullName(lead.customer) : String(shipTo?.name || shipTo?.company || '').trim()) || null;
  const shownLine = lines[0]!;
  const shown = shownLine.record;
  const pack = orderStage(lead, 'pack', { todayKey, staffName });
  const lineStage = (kind: 'pick' | 'qc') =>
    lines.find((l) => !l.stages[kind].done)?.stages[kind] ?? shownLine.stages[kind];
  const listingItem = String(shown.item_number || shown.sku || '').trim() || null;
  // Bare like every platform's id (owner 2026-09-28: no "#" on an id-less record).
  const orderId = String(lead.order_id || '').trim() || String(lead.id);
  const adminUrl = rows.map((r) => String(r.admin_url ?? '').trim()).find(Boolean) ?? null;
  const state = worstState(built.map((l) => l.state));
  const pickup = lead.fulfillment_channel === PICKUP_FULFILLMENT_CHANNEL;
  const pick = lineStage('pick');
  return {
    key,
    ids: built.map((l) => l.id),
    lead,
    lines,
    state,
    orderId,
    accountSource: lead.account_source ?? null,
    adminUrl,
    orderHref: orderAdminUrl(orderId, lead.account_source, adminUrl),
    fba: String(lead.fulfillment_channel ?? '').trim().toUpperCase() === 'AFN',
    pickup,
    sla,
    units: built.reduce((sum, l) => sum + l.qty, 0),
    outOfStockCount: built.filter((l) => l.outOfStock).length,
    urgent: rows.some((r) => r.is_urgent === true),
    urgentLabel: ordersUrgentWord(rows),
    buyerNote,
    staffNote,
    buyerName,
    listingHref: getExternalUrlByItemNumber(listingItem),
    listingItem,
    listingMatchesOrder: listingMatchesOrderPlatform(listingItem, getOrderPlatformLabel(orderId, lead.account_source)),
    pack,
    stages: [pick, lineStage('qc'), pack],
    next: orderNextStep(state, { pick, pack }, pickup),
  };
}
