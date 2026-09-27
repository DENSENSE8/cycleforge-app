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
import type { LifecycleState } from '@/design-system/tokens/lifecycle';
import { recordState, worstState } from '@/components/outbound/orders/outbound-orders-ledger-state';
import { conditionLabel } from '@/lib/conditions';
import { resolveOrderBin, type OrderBinFace } from '@/lib/shipping/outbound-storage-path';
import { ordersLineTitle, resolveOrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import type { CompoundDelay } from '@/components/tables/compound/compound-row-model';
import { formatCurrency } from '@/utils/_number';
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';
import { orderAdminUrl } from '@/utils/order-platform';
import { orderStage, type OrderStage } from '@/lib/orders/order-stages';
import { customerFullName } from '@/lib/customers/customer-display';

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
  /** On-hand count for the SKU; null when there is no stock row. */
  stock: number | null;
  bin: OrderBinFace;
  price: string | null;
  priceEstimate: boolean;
  outOfStock: boolean;
  /** Why it is short ("2 short · Brake lever"), when the report named it. */
  shortNote: string | null;
  sku: string | null;
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
  sla: OrderCardSla;
  /** Units across every line. */
  units: number;
  outOfStockCount: number;
  urgent: boolean;
  buyerNote: string | null;
  /** Linked customer's name, else the ShipStation ship-to name / company. Null when neither. */
  buyerName: string | null;
  /** The shown product's marketplace listing — item number, else SKU (the To-ship listing rule). */
  listingHref: string | null;
  /** The item number (or SKU) {@link listingHref} was built from. */
  listingItem: string | null;
  /** Pack — once per order (one box), read from the lead row. */
  pack: OrderStage;
  /**
   * The order-level Pick → QC → Pack reading (quick look, record, "where is it
   * now"): Pick / QC are the first line still waiting on that stage (else the
   * shown line's), Pack is {@link pack}. Always all three, in that order.
   */
  stages: readonly OrderStage[];
}

function linePrice(line: ShippedOrder): { text: string | null; estimate: boolean } {
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

function lineCondition(line: ShippedOrder): { label: string | null; code: string | null } {
  const code = String(line.condition ?? '').trim().toUpperCase();
  if (!code || code === 'N/A') return { label: null, code: null }; // ds-allow-na: marketplace empty-vocab reader
  // A marketplace word outside the grade vocabulary comes back raw ("USED").
  const label = conditionLabel(code, 'label');
  return { label: label === label.toUpperCase() ? label[0] + label.slice(1).toLowerCase() : label, code };
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
  const stock = Number(line.sku_stock_on_hand);
  const qty = Number(line.quantity);
  const outOfStock = line.is_out_of_stock === true;
  return {
    record: line,
    id: Number(line.id),
    title: ordersLineTitle(line),
    thumbUrl: String(line.catalog_image_url || '').trim() || null,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    condition: condition.label,
    conditionCode: condition.code,
    stock: line.sku_stock_on_hand != null && Number.isFinite(stock) ? stock : null,
    bin: resolveOrderBin(line.storage_locations, line.sku_home_location),
    price: price.text,
    priceEstimate: price.estimate,
    outOfStock,
    shortNote: shortNote(line),
    sku: String(line.sku ?? '').trim() || null,
    state: recordState(line),
    stages: {
      pick: orderStage(line, 'pick', { todayKey, staffName, outOfStock }),
      qc: orderStage(line, 'qc', { todayKey, staffName }),
    },
  };
}

/** The deadline, worded for the card's top-right corner. */
export function orderCardSla(delay: CompoundDelay, tip: string | null): OrderCardSla {
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
  const shipTo = lead.shipstation_ship_to;
  const buyerName =
    (lead.customer ? customerFullName(lead.customer) : String(shipTo?.name || shipTo?.company || '').trim()) || null;
  const shownLine = lines[0]!;
  const shown = shownLine.record;
  const pack = orderStage(lead, 'pack', { todayKey, staffName });
  const lineStage = (kind: 'pick' | 'qc') =>
    lines.find((l) => !l.stages[kind].done)?.stages[kind] ?? shownLine.stages[kind];
  const listingItem = String(shown.item_number || shown.sku || '').trim() || null;
  const orderId = String(lead.order_id || '').trim() || `#${lead.id}`;
  const adminUrl = rows.map((r) => String(r.admin_url ?? '').trim()).find(Boolean) ?? null;
  return {
    key,
    ids: built.map((l) => l.id),
    lead,
    lines,
    state: worstState(built.map((l) => l.state)),
    orderId,
    accountSource: lead.account_source ?? null,
    adminUrl,
    orderHref: orderAdminUrl(orderId, lead.account_source, adminUrl),
    fba: String(lead.fulfillment_channel ?? '').trim().toUpperCase() === 'AFN',
    sla,
    units: built.reduce((sum, l) => sum + l.qty, 0),
    outOfStockCount: built.filter((l) => l.outOfStock).length,
    urgent: rows.some((r) => r.is_urgent === true),
    buyerNote,
    buyerName,
    listingHref: getExternalUrlByItemNumber(listingItem),
    listingItem,
    pack,
    stages: [lineStage('pick'), lineStage('qc'), pack],
  };
}
