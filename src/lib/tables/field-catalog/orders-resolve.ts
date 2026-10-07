/** Orders slot resolvers — row + fieldId → the resolved facts a slot cell paints. */

import type {
  Delay,
  SlotValue,
  SubtitlePart,
} from '@/lib/tables/field-catalog/slot-value';
import {
  formatQueueRowDateCell,
  nonSentinelTimestamp,
} from '@/components/dashboard/orders-queue/helpers';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import { conditionGradeTableLabel, conditionLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { catalogById, type FieldDef } from '@/lib/tables/field-catalog/types';
import { ORDERS_FIELD_CATALOG } from '@/lib/tables/field-catalog/orders';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import type { ShippedOrder } from '@/types/orders';
import { formatCurrency } from '@/utils/_number';
import { formatMonthDayTimePST, getDaysLateNullable } from '@/utils/date';
import { customerFullName, customerPlace } from '@/lib/customers/customer-display';
import { resolveCarrierBrand, type CarrierBrandMeta } from '@/lib/carrier-brand';
import {
  orderFulfillmentBadge,
  type OrderFulfillmentBadge,
} from '@/lib/orders/order-fulfillment-badge';
import { resolveOrderRowFlag } from '@/lib/orders/order-row-flags';
import {
  ordersGroupItemStatus,
  ordersOrderedAt,
  ordersShipByDelay,
  ordersShipByRaw,
} from '@/lib/orders/orders-compound-view';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

interface OrdersSlotContext {
  /**
   * Normalized tester face from the queue view layer (`---` = missing). No
   * stage resolver reads it: Pick reads its own `picked_*` projection, never
   * the tester (operator ruling 2026-09-14; QC/Pick split 2026-09-27).
   */
  testerDisplay?: string | null;
  /** Normalized packer face from the queue view layer (`---` = missing). */
  packerDisplay?: string | null;
  /** Subtitle fields the mounting surface made EDITABLE in place (a select editor claims the part by key). */
  editableFieldIds?: readonly string[];
}

const ORDERS_FIELDS_BY_ID = catalogById(ORDERS_FIELD_CATALOG);

/** `---` and blanks are the queue's "nobody" faces — a step line omits them. */
function person(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s && s !== '---' ? s : null;
}

function stamp(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const raw = nonSentinelTimestamp(candidate);
    if (!raw) continue;
    const formatted = formatMonthDayTimePST(raw);
    if (formatted && formatted !== '—') return formatted;
  }
  return null;
}

type OrdersRow = ShippedOrder & Record<string, unknown>;

function str(row: OrdersRow, key: string): string | null {
  const s = String(row[key] ?? '').trim();
  return s || null;
}

function staffId(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

/**
 * Pick step facts, off the feed's own pick projection (`picked_by_name` /
 * `picked_by` / `picked_at` — the picked-by resolver,
 * `src/lib/picking/picked-by.ts`). Never QC facts, never the PICK assignee
 * (`picker_*` is who it is ASSIGNED to, not who picked it).
 */
function pickedStep(row: OrdersRow): SlotValue {
  return {
    kind: 'stage_event',
    who: person(str(row, 'picked_by_name')),
    whoStaffId: staffId(row.picked_by),
    at: stamp(row.picked_at),
    // No pick bench on the wire: the pick scan's station is 'PACK' for every
    // event (api/picking/units/scan), which would paint the wrong desk's name here.
    station: null,
  };
}

function packedStep(row: OrdersRow, ctx: OrdersSlotContext): SlotValue {
  const benchName = str(row, 'pack_location_name');
  return {
    kind: 'stage_event',
    who: person(ctx.packerDisplay) ?? person(str(row, 'packed_by_name') ?? str(row, 'packer_name')),
    whoStaffId: staffId(row.packed_by, row.packer_id),
    at: stamp(row.packed_at, row.pack_activity_at),
    station: benchName
      ? packBenchShortLabel({
          locationName: benchName,
          locationKind: String(row.pack_location_kind ?? ''),
        })
      : null,
  };
}

function scannedOutStep(row: OrdersRow): SlotValue {
  return {
    kind: 'stage_event',
    who: person(str(row, 'shipped_out_by_name')),
    whoStaffId: staffId(row.shipped_out_by),
    at: stamp(row.ship_confirmed_at),
    station: null,
  };
}

function moneyText(value: unknown): string | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolveOrdersSlotValue(
  record: ShippedOrder,
  fieldId: string,
  ctx: OrdersSlotContext = {},
): SlotValue | null {
  const row = record as OrdersRow;
  switch (fieldId) {
    case 'orders.picked':
      return pickedStep(row);
    case 'orders.packed':
      return packedStep(row, ctx);
    case 'orders.scanned_out':
      return scannedOutStep(row);
    case 'orders.item_number':
      return { kind: 'value', text: str(row, 'item_number') };
    case 'orders.qty':
      return { kind: 'value', text: str(row, 'quantity') };
    case 'orders.condition': {
      const label = conditionGradeTableLabel(str(row, 'condition'));
      return { kind: 'value', text: label === EMPTY_META_DASH ? null : label };
    }
    case 'orders.notes':
      return { kind: 'value', text: str(row, 'notes') };
    case 'orders.amount':
      return { kind: 'value', text: moneyText(record.sale_amount) };
    case 'orders.order_id':
      return { kind: 'value', text: str(row, 'order_id') };
    default:
      return null;
  }
}

/**
 * Resolve the slot values for every mounted slot TRACK of one row, keyed by
 * track key — the record `RowView.slots` carries. Non-slot columns and
 * unbound tracks contribute nothing.
 */
export function ordersSlotValues(
  record: ShippedOrder,
  columns: readonly { key: string; fieldId?: string }[],
  ctx: OrdersSlotContext = {},
): Readonly<Record<string, SlotValue>> | undefined {
  let slots: Record<string, SlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId || !col.key.startsWith('status:')) continue;
    const value = resolveOrdersSlotValue(record, col.fieldId, ctx);
    if (!value) continue;
    (slots ??= {})[col.key] = value;
  }
  return slots;
}

/** The compound ITEM cell's secondary line for bound subtitle fields — TONED PARTS in binding order (the layout's array IS the display… */
export function ordersSubtitleParts(
  record: ShippedOrder,
  subtitleFieldIds: readonly string[],
  ctx: OrdersSlotContext = {},
): SubtitlePart[] {
  const row = record as OrdersRow;
  const parts: SubtitlePart[] = [];
  for (const fieldId of subtitleFieldIds) {
    const field: FieldDef | undefined = ORDERS_FIELDS_BY_ID.get(fieldId);
    if (!field) continue;
    if (fieldId === 'orders.item_number') {
      // Face is the listing glyph in the trailing cluster — never the id.
      parts.push({ text: '', key: fieldId });
      continue;
    }
    const value = resolveOrdersSlotValue(record, fieldId, ctx);
    if (!value || value.kind !== 'value' || !value.text) {
      if (ctx.editableFieldIds?.includes(fieldId)) {
        parts.push({ text: EMPTY_META_DASH, toneClass: 'text-text-faint', key: fieldId });
      }
      continue;
    }
    if (fieldId === 'orders.qty') {
      const qty = Number(value.text);
      const countTone = orderRowQtyTone(Number.isFinite(qty) ? qty : 1);
      parts.push({
        text: value.text,
        // Dark + bold under the title. Notes keep the muted caption; qty 2+
        // still warns, but a quantity of 1 is no longer the gray subtitle.
        toneClass:
          countTone === 'text-text-muted'
            ? 'font-semibold text-text-default'
            : `font-semibold ${countTone}`,
        key: fieldId,
        // Two digits, always.
        widthCh: 2,
      });
      continue;
    }
    if (fieldId === 'orders.condition') {
      const grade = conditionGradeTextClass(str(row, 'condition'));
      parts.push({
        text: value.text,
        toneClass:
          grade === 'text-text-muted' || grade === 'text-text-faint'
            ? 'font-semibold text-text-default'
            : `font-semibold ${grade}`,
        key: fieldId,
      });
      continue;
    }
    parts.push({ text: value.text, key: fieldId });
  }
  return parts;
}

// ── The INDEX face — one ORDER (all its lines) per row ───────────────────────

/** One derived chip in the Tags column (owner D6: no free-form tags yet). */
export interface OrdersIndexTag {
  label: string;
  /** `flag` wears the row flag's own house chip (`chipClass`). */
  tone: 'warning' | 'critical' | 'neutral' | 'flag';
  chipClass?: string;
}

/** One resolved index cell — the cell paints by `kind`, never by field id. */
export type OrdersIndexValue =
  | { kind: 'placed'; face: string; tip: string }
  | { kind: 'customer'; name: string | null; place: string | null }
  | { kind: 'channel'; orderId: string; accountSource: string | null; fba: boolean }
  | { kind: 'money'; text: string | null; estimate: boolean }
  | { kind: 'fulfillment'; badge: OrderFulfillmentBadge }
  | { kind: 'deadline'; delay: Delay; tip: string | null }
  | { kind: 'items'; face: string; lines: readonly string[] }
  | { kind: 'delivery'; carriers: readonly CarrierBrandMeta[] }
  | { kind: 'tags'; tags: readonly OrdersIndexTag[] }
  | { kind: 'bin'; path: string | null }
  | SlotValue;

interface OrdersIndexContext {
  /** Warehouse civil today (`YYYY-MM-DD`) — "Today" and due-today faces. */
  todayKey: string;
  packerDisplay?: string | null;
}

function lineQty(line: ShippedOrder): number {
  const qty = Number(line.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

/** A line's product title under the SKU identity law (Zoho item → catalog listing → SKU). */
export function ordersLineTitle(line: ShippedOrder): string {
  const zohoTitle = (line as OrdersRow).zoho_item_title;
  return (
    resolveSkuIdentityTitle({
      zoho_item_title: typeof zohoTitle === 'string' ? zohoTitle : null,
      catalog_product_title: line.product_title,
      sku: line.sku,
    }) || 'Untitled line'
  );
}

/** Order total: realised sale amounts; a line with none falls back to its resolved price (an ask ⇒ estimate). */
function orderTotal(lines: readonly ShippedOrder[]): { text: string | null; estimate: boolean } {
  let total = 0;
  let priced = false;
  let estimate = false;
  for (const line of lines) {
    const sale = Number(line.sale_amount);
    if (line.sale_amount != null && line.sale_amount !== '' && Number.isFinite(sale)) {
      total += sale;
      priced = true;
    } else if (typeof line.price_cents === 'number') {
      total += line.price_cents / 100;
      priced = true;
      estimate ||= line.price_is_estimate === true;
    }
  }
  if (!priced) return { text: null, estimate: false };
  const lead = lines[0];
  const currency = String(lead?.currency || lead?.price_currency || 'USD').trim().toUpperCase();
  try {
    return { text: formatCurrency(total, currency), estimate };
  } catch {
    // A stored currency Intl does not know — the figure still reads in USD.
    return { text: formatCurrency(total), estimate };
  }
}

function orderCustomer(lead: ShippedOrder): { name: string | null; place: string | null } {
  if (lead.customer) {
    return {
      name: customerFullName(lead.customer) || null,
      place: customerPlace(lead.customer) || null,
    };
  }
  const shipTo = lead.shipstation_ship_to;
  const name = String(shipTo?.name || shipTo?.company || '').trim() || null;
  const place = [shipTo?.city, shipTo?.state].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  return { name, place: place || null };
}

/** Earliest deadline across the lines — the one that makes the order late. */
function orderDeadline(
  lines: readonly ShippedOrder[],
  todayKey: string,
): { delay: Delay; tip: string | null } {
  let raw: string | null = null;
  let lead: ShippedOrder = lines[0]!;
  for (const line of lines) {
    const candidate = ordersShipByRaw(line);
    if (candidate && (!raw || new Date(candidate).getTime() < new Date(raw).getTime())) {
      raw = candidate;
      lead = line;
    }
  }
  const delay = ordersShipByDelay(lead, getDaysLateNullable(raw), todayKey);
  return { delay, tip: formatQueueRowDateCell(raw)?.tooltip ?? null };
}

function orderTags(lines: readonly ShippedOrder[]): OrdersIndexTag[] {
  const tags: OrdersIndexTag[] = [];
  if (lines.some((line) => line.is_urgent === true)) tags.push({ label: 'Urgent', tone: 'warning' });
  // The WHY of a hold — the badge already says "On hold"; the chip names the reason.
  const exceptionReason = lines
    .map((line) => String(line.exception_reason ?? '').trim())
    .find(Boolean);
  if (exceptionReason) tags.push({ label: exceptionReason, tone: 'critical' });
  const shortage = ordersGroupItemStatus(lines);
  if (shortage && shortage.label !== 'Out of stock' && shortage.label !== 'Exception') {
    tags.push({ label: shortage.label, tone: 'critical' });
  }
  // Hold is the fulfillment badge's word, not a second chip.
  const flag = resolveOrderRowFlag(lines[0]?.row_flag?.flag);
  if (flag && flag.id !== 'hold') {
    tags.push({ label: flag.label, tone: 'flag', chipClass: flag.chipClass });
  }
  const conditions = new Set<string>();
  for (const line of lines) {
    const code = String(line.condition ?? '').trim().toUpperCase();
    if (!code || code === 'N/A') continue; // ds-allow-na: marketplace empty-vocab reader
    // A marketplace word outside the grade vocabulary comes back raw ("USED");
    // the triage face is sentence case.
    const label = conditionLabel(code, 'label');
    conditions.add(label === label.toUpperCase() ? label[0] + label.slice(1).toLowerCase() : label);
  }
  for (const label of conditions) tags.push({ label, tone: 'neutral' });
  return tags;
}

/**
 * Resolve one INDEX field for one ORDER. `lines` is every line of the order
 * (a single-line order passes one) — a group parent and a lone row resolve the
 * same fact, which is what makes the list one row per order. Unknown field id
 * → null (the cell dashes).
 */
export function resolveOrdersIndexValue(
  lines: readonly ShippedOrder[],
  fieldId: string,
  ctx: OrdersIndexContext,
): OrdersIndexValue | null {
  const lead = lines[0];
  if (!lead) return null;
  switch (fieldId) {
    case 'orders.order_date': {
      const placed = ordersOrderedAt(lead);
      if (!placed) return null;
      return {
        kind: 'placed',
        face: placed.dateKey === ctx.todayKey ? 'Today' : placed.label,
        tip: placed.tip ?? placed.label,
      };
    }
    case 'orders.customer':
      return { kind: 'customer', ...orderCustomer(lead) };
    case 'orders.channel':
      return {
        kind: 'channel',
        orderId: String(lead.order_id || '').trim(),
        accountSource: lead.account_source ?? null,
        fba: String(lead.fulfillment_channel ?? '').trim().toUpperCase() === 'AFN',
      };
    case 'orders.total':
      return { kind: 'money', ...orderTotal(lines) };
    case 'orders.fulfillment':
      return { kind: 'fulfillment', badge: orderFulfillmentBadge(lines) };
    case 'orders.fulfill_by':
      return { kind: 'deadline', ...orderDeadline(lines, ctx.todayKey) };
    case 'orders.items': {
      const count = lines.reduce((sum, line) => sum + lineQty(line), 0);
      return {
        kind: 'items',
        face: `${count} item${count === 1 ? '' : 's'}`,
        lines: lines.map((line) => `${lineQty(line)} × ${ordersLineTitle(line)}`),
      };
    }
    case 'orders.delivery': {
      const byCarrier = new Map<string, CarrierBrandMeta>();
      for (const line of lines) {
        const tracking = String(line.shipping_tracking_number ?? '').trim();
        if (!tracking && !String(line.carrier ?? '').trim()) continue;
        const brand = resolveCarrierBrand(tracking, line.carrier);
        if (brand.carrier !== 'Unknown') byCarrier.set(brand.carrier, brand);
      }
      return { kind: 'delivery', carriers: [...byCarrier.values()] };
    }
    case 'orders.tags':
      return { kind: 'tags', tags: orderTags(lines) };
    case 'orders.bin':
      return {
        kind: 'bin',
        path: formatOutboundStoragePath(lines.flatMap((line) => line.storage_locations ?? [])),
      };
    case 'orders.picked':
    case 'orders.packed':
      return resolveOrdersSlotValue(lead, fieldId, { packerDisplay: ctx.packerDisplay });
    default:
      return null;
  }
}

/** Every mounted index slot track of one order, keyed by track key. */
export function ordersIndexValues(
  lines: readonly ShippedOrder[],
  columns: readonly { key: string; fieldId?: string }[],
  ctx: OrdersIndexContext,
): Readonly<Record<string, OrdersIndexValue>> {
  const values: Record<string, OrdersIndexValue> = {};
  for (const col of columns) {
    if (!col.fieldId || !col.key.startsWith('status:')) continue;
    const value = resolveOrdersIndexValue(lines, col.fieldId, ctx);
    if (value) values[col.key] = value;
  }
  return values;
}
