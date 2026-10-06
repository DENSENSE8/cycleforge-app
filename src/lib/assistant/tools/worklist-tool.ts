/**
 * get_worklist — "what should I do first?" (chat-roi row 8). GREEN.
 *
 * Five outbound worklists, each read through the desk's OWN list so a chat
 * answer can never disagree with the page it points at:
 *
 *  - exceptions     → `listOrderExceptions` (the Exceptions desk, its order)
 *  - out_of_stock   → `listOrders` `blockedOnly` (every out-of-stock order —
 *                     FBM › Exceptions lists them all)
 *  - need_to_order  → `listNeedToOrder` (replenishment requests, FIFO —
 *                     Warehouse › Replenish)
 *  - pending        → `listOrders` `inWarehouse` (FBM › Allocate)
 *  - late           → pending ∪ out of stock whose ship-by day is before
 *                     today on the warehouse calendar
 *  - all            → one row per list with its count and top item
 *
 * Each answer is a table (panel) plus ONE "do first" line ranked by urgency:
 * days past ship-by, then the urgent flag, then the earliest ship-by.
 */

import { z } from 'zod';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { listOrderExceptions, type OrderExceptionRow } from '@/lib/orders/order-exceptions';
import { listOrders } from '@/lib/orders/orders-list';
import { parseOrdersListQuery } from '@/lib/orders/orders-list-query';
import { deskViewHref } from '@/lib/outbound/desk-views';
import { listNeedToOrder } from '@/lib/replenishment';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { AssistantToolDef } from './types';

export const WORKLIST_KINDS = ['all', 'exceptions', 'out_of_stock', 'need_to_order', 'late', 'pending'] as const;
export type WorklistKind = (typeof WORKLIST_KINDS)[number];
type ListKind = Exclude<WorklistKind, 'all'>;

/** Most urgent first — the order "what do I do first" walks. */
const URGENCY: readonly ListKind[] = ['late', 'exceptions', 'out_of_stock', 'need_to_order', 'pending'];

const LIST_LABELS: Readonly<Record<ListKind, string>> = {
  late: 'Late (past ship-by)',
  exceptions: 'Exceptions',
  out_of_stock: 'Out of stock',
  need_to_order: 'Need to order',
  pending: 'Pending (to ship)',
};

const LIST_HREFS: Readonly<Record<ListKind, string>> = {
  late: deskViewHref('triage'),
  exceptions: deskViewHref('exceptions'),
  out_of_stock: deskViewHref('exceptions'),
  need_to_order: '/inventory?section=replenish',
  pending: deskViewHref('triage'),
};

/** One worklist row, normalized across the three sources. */
export interface WorkItem {
  /** Order number, or the SKU for a replenishment request. */
  ref: string;
  sku: string | null;
  title: string | null;
  qty: number | null;
  shipBy: string | null;
  /** Whole days past ship-by (warehouse calendar); null when not late or no ship-by. */
  daysLate: number | null;
  urgent: boolean;
  /** Why it is on the list / what blocks it. */
  reason: string | null;
  /** The next step, in the desk's words. */
  action: string | null;
  owner: string | null;
  channel: string | null;
  /** Replenishment only: orders waiting on this SKU. */
  ordersWaiting?: number;
}

// ─── Pure shaping ────────────────────────────────────────────────────────────

/** YYYY-MM-DD of `now` on the warehouse calendar. */
export function warehouseToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WAREHOUSE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Whole days `shipBy` (YYYY-MM-DD) lies before `today`; null when on time or absent. */
export function daysPastShipBy(shipBy: string | null, today: string): number | null {
  if (!shipBy || !/^\d{4}-\d{2}-\d{2}/.test(shipBy)) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${shipBy.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return days > 0 ? days : null;
}

/** Most urgent first: days late, then urgent, then earliest ship-by; ties keep the desk's order. */
export function rankByUrgency(items: readonly WorkItem[]): WorkItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (b.item.daysLate ?? 0) - (a.item.daysLate ?? 0) ||
        Number(b.item.urgent) - Number(a.item.urgent) ||
        (a.item.shipBy ?? '9999').localeCompare(b.item.shipBy ?? '9999') ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "order 21-15107-47310 (Bose PCB board) — 3 days past ship-by; Pair the SKU" */
export function doFirstLine(kind: ListKind, item: WorkItem): string {
  const what = kind === 'need_to_order' ? `order ${item.qty !== null ? `${item.qty} × ` : ''}${item.ref}` : `order ${item.ref}`;
  // A replenishment row with no SKU is already named by its title — never say it twice.
  const title = item.title && item.title !== item.ref ? ` (${item.title.slice(0, 60)})` : '';
  const late = item.daysLate ? ` — ${plural(item.daysLate, 'day')} past ship-by` : item.shipBy ? ` — ship by ${item.shipBy}` : '';
  const waiting = item.ordersWaiting ? ` — ${plural(item.ordersWaiting, 'order')} waiting` : '';
  const next = item.action ?? item.reason;
  return `${what}${title}${late}${waiting}${next ? `; ${next}` : ''}`;
}

const COLUMNS: Readonly<Record<ListKind, readonly string[]>> = {
  exceptions: ['Order', 'SKU', 'Item', 'Reason', 'Next step', 'Owner', 'Platform'],
  out_of_stock: ['Order', 'SKU', 'Item', 'Short', 'Ship by', 'Days late', 'Replenishment'],
  need_to_order: ['SKU', 'Item', 'To order', 'Orders waiting', 'Vendor', 'Status'],
  late: ['Order', 'Ship by', 'Days late', 'SKU', 'Item', 'Why'],
  pending: ['Order', 'Ship by', 'SKU', 'Item', 'Qty', 'Platform'],
};

function cells(item: WorkItem): Record<string, string | number | null> {
  return {
    Order: item.ref,
    SKU: item.sku,
    Item: item.title,
    Reason: item.reason,
    'Next step': item.action,
    Owner: item.owner,
    Platform: item.channel,
    Short: item.qty,
    'Ship by': item.shipBy,
    'Days late': item.daysLate,
    Replenishment: item.action,
    'To order': item.qty,
    'Orders waiting': item.ordersWaiting ?? null,
    Vendor: item.owner,
    Status: item.reason,
    Why: item.reason,
    Qty: item.qty,
  };
}

/** One list → its ranked table and the "do first" line. */
export function buildWorklistEnvelope(kind: ListKind, items: readonly WorkItem[]): ToolArtifactEnvelope | { found: false; kind: ListKind; message: string } {
  const label = LIST_LABELS[kind];
  if (items.length === 0) {
    return { found: false, kind, message: `The ${label.toLowerCase()} list is empty right now — nothing to do there.` };
  }
  const ranked = kind === 'exceptions' || kind === 'need_to_order' ? [...items] : rankByUrgency(items);
  if (kind === 'need_to_order') ranked.sort((a, b) => (b.ordersWaiting ?? 0) - (a.ordersWaiting ?? 0));
  const columns = COLUMNS[kind];
  const artifact: ArtifactTable = {
    kind: 'table',
    title: `${label} · ${items.length}`,
    columns: [...columns],
    rows: ranked.slice(0, 200).map((item) => Object.fromEntries(columns.map((c) => [c, cells(item)[c] ?? null]))),
    entityHint: kind === 'need_to_order' ? 'SKU' : 'order',
    idColumn: kind === 'need_to_order' ? 'SKU' : 'Order',
    identity: { title: label, ids: [], chips: [plural(items.length, kind === 'need_to_order' ? 'SKU' : 'order')], href: LIST_HREFS[kind] },
  };
  const first = doFirstLine(kind, ranked[0]);
  const lateCount = items.filter((i) => i.daysLate).length;
  const answer = `${label}: ${plural(items.length, kind === 'need_to_order' ? 'SKU' : 'order')}${lateCount && kind !== 'late' ? `, ${lateCount} past ship-by` : ''}. Do first: ${first}.`;
  return brandReportEnvelope(
    { artifact, summary: `${answer} The ranked table is already on screen — do not render it or list the rows again.`, answer },
    'get_worklist',
  );
}

/** Every list → one row each, most urgent list first, and the one thing to do first. */
export function buildOverviewEnvelope(lists: Readonly<Record<ListKind, readonly WorkItem[]>>): ToolArtifactEnvelope {
  const rows = URGENCY.map((kind) => {
    const ranked = kind === 'exceptions' || kind === 'need_to_order' ? [...lists[kind]] : rankByUrgency(lists[kind]);
    return { kind, count: lists[kind].length, top: ranked[0] ?? null };
  });
  const firstNonEmpty = rows.find((r) => r.top);
  const artifact: ArtifactTable = {
    kind: 'table',
    title: 'What to do first',
    columns: ['Worklist', 'Count', 'Top item', 'Why'],
    rows: rows.map((r) => ({
      Worklist: LIST_LABELS[r.kind],
      Count: r.count,
      'Top item': r.top ? (r.kind === 'need_to_order' ? `SKU ${r.top.ref}` : `Order ${r.top.ref}`) : null,
      Why: r.top ? (r.top.daysLate ? `${plural(r.top.daysLate, 'day')} past ship-by` : r.top.action ?? r.top.reason) : null,
    })),
    entityHint: 'worklist',
    idColumn: 'Worklist',
  };
  const counts = rows.filter((r) => r.count > 0).map((r) => `${r.count} ${LIST_LABELS[r.kind].toLowerCase()}`).join(', ');
  const answer = firstNonEmpty?.top
    ? `Do first: ${doFirstLine(firstNonEmpty.kind, firstNonEmpty.top)} (${LIST_LABELS[firstNonEmpty.kind].toLowerCase()}). Open work: ${counts}.`
    : 'Every worklist is empty — nothing is waiting.';
  return brandReportEnvelope(
    { artifact, summary: `${answer} The worklist table is already on screen — do not render it again.`, answer },
    'get_worklist',
  );
}

// ─── Sources ─────────────────────────────────────────────────────────────────

type OrderListRow = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
}

/** A `/api/orders` row (to-ship / pick / blocked feed) → a work item. */
export function workItemFromOrder(row: OrderListRow, today: string, blocked: boolean): WorkItem {
  const shipBy = str(row.ship_by_date)?.slice(0, 10) ?? null;
  const replenishment = str(row.replenishment_po_number)
    ? `On PO ${str(row.replenishment_po_number)}`
    : str(row.replenishment_status)
      ? `Replenishment ${String(row.replenishment_status).replace(/_/g, ' ')}`
      : blocked
        ? 'Not ordered yet'
        : null;
  return {
    ref: str(row.order_id) ?? `#${row.id}`,
    sku: blocked ? (str(row.oos_sku) ?? str(row.sku)) : str(row.sku),
    title: (blocked ? (str(row.oos_title) ?? str(row.product_title)) : str(row.product_title))?.slice(0, 120) ?? null,
    qty: blocked ? num(row.oos_qty_short) : num(row.quantity),
    shipBy,
    daysLate: daysPastShipBy(shipBy, today),
    urgent: row.is_urgent === true,
    reason: blocked ? 'Out of stock' : 'To ship',
    action: replenishment,
    owner: null,
    channel: str(row.account_source),
  };
}

function workItemFromException(row: OrderExceptionRow): WorkItem {
  return {
    ref: row.orderNumber ?? `#${row.id}`,
    sku: row.catalogSku ?? row.sku,
    title: (row.catalogTitle ?? row.productTitle)?.slice(0, 120) ?? null,
    qty: num(row.quantity),
    shipBy: null,
    daysLate: null,
    urgent: row.releaseState === 'caged',
    reason: row.routing.category,
    action: row.routing.actionRequired,
    owner: row.responsiblePerson ?? row.routing.owner,
    channel: row.accountSource,
  };
}

function workItemFromReplenishment(row: Record<string, unknown>): WorkItem {
  const waiting = Array.isArray(row.orders_waiting) ? row.orders_waiting.length : 0;
  return {
    ref: str(row.sku) ?? str(row.item_name) ?? String(row.id),
    sku: str(row.sku),
    title: str(row.item_name)?.slice(0, 120) ?? null,
    qty: num(row.quantity_to_order) ?? num(row.quantity_needed),
    shipBy: null,
    daysLate: null,
    urgent: false,
    reason: str(row.status)?.replace(/_/g, ' ') ?? null,
    action: null,
    owner: str(row.vendor_name),
    channel: null,
    ordersWaiting: waiting,
  };
}

export interface WorklistSources {
  exceptions: (orgId: OrgId) => Promise<OrderExceptionRow[]>;
  orders: (orgId: OrgId, params: Record<string, string>) => Promise<OrderListRow[]>;
  needToOrder: (orgId: OrgId) => Promise<Array<Record<string, unknown>>>;
}

const realSources: WorklistSources = {
  exceptions: (orgId) => listOrderExceptions(orgId, { limit: 200 }),
  orders: async (orgId, params) =>
    (await listOrders(orgId, parseOrdersListQuery(new URLSearchParams({ ...params, limit: '500' })))).payload.orders,
  needToOrder: async (orgId) => (await listNeedToOrder({ limit: 200 }, orgId)).items as Array<Record<string, unknown>>,
};

let sources: WorklistSources = realSources;

/** Test seam — swap the reads; returns a restore function. */
export function setWorklistSourcesForTest(next: WorklistSources): () => void {
  sources = next;
  return () => {
    sources = realSources;
  };
}

async function loadList(orgId: OrgId, kind: ListKind, today: string): Promise<WorkItem[]> {
  switch (kind) {
    case 'exceptions':
      return (await sources.exceptions(orgId)).map(workItemFromException);
    case 'need_to_order':
      return (await sources.needToOrder(orgId)).map(workItemFromReplenishment);
    case 'out_of_stock':
      return (await sources.orders(orgId, { blockedOnly: 'true' })).map((r) => workItemFromOrder(r, today, true));
    case 'pending':
      return (await sources.orders(orgId, { inWarehouse: 'true' })).map((r) => workItemFromOrder(r, today, false));
    case 'late': {
      const [toShip, blocked] = await Promise.all([loadList(orgId, 'pending', today), loadList(orgId, 'out_of_stock', today)]);
      const seen: Record<string, true> = {};
      return [...toShip, ...blocked].filter((item) => {
        if (!item.daysLate || seen[item.ref]) return false;
        seen[item.ref] = true;
        return true;
      });
    }
  }
}

const worklistInput = z.object({
  kind: z
    .enum(WORKLIST_KINDS)
    .default('all')
    .describe('all = what to do first across every list; exceptions; out_of_stock; need_to_order; late (past ship-by); pending (to ship).'),
});

export const getWorklist: AssistantToolDef<typeof worklistInput> = {
  name: 'get_worklist',
  description:
    'Outbound worklists ranked by urgency, with the one thing to do first: "what should I do first", exceptions queue, out of stock, need to order, late / past ship-by orders, pending (to ship). Shows the ranked table itself.',
  permission: 'orders.view',
  inputSchema: worklistInput,
  run: async (input, ctx) => {
    const today = warehouseToday();
    if (input.kind === 'all') {
      const loaded = await Promise.all(URGENCY.map((k) => loadList(ctx.organizationId, k, today)));
      const lists = Object.fromEntries(URGENCY.map((k, i) => [k, loaded[i]])) as Record<ListKind, WorkItem[]>;
      return buildOverviewEnvelope(lists);
    }
    return buildWorklistEnvelope(input.kind, await loadList(ctx.organizationId, input.kind, today));
  },
};
