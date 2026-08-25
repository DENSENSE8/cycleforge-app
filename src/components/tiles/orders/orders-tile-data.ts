'use client';

/**
 * Orders tile — the data seam.
 *
 * HOST-AGNOSTIC ON PURPOSE (HANDOFF-orders-first): the tile's internals may be
 * re-parented from today's `TileBody` mounting into the rebuilt D2 canvas
 * without touching this file. Nothing here imports the shell.
 *
 * Every write goes through an EXISTING gated route — this module adds no new
 * write path:
 *   queue    GET   /api/orders?listShape=queue          (orders.view)
 *   record   GET   /api/orders/[id]                     (orders.view — carries is_urgent)
 *   detail   GET   /api/orders/lookup/[orderId]         (orders.view — order + activity)
 *   notes    GET   /api/orders/[id]/notes               (orders.view)
 *   urgency  POST  /api/orders/assign                   (orders.create — { orderIds, isUrgent })
 *   note     POST  /api/orders/[id]/notes               (orders.create — { noteText })
 *   spawn    PATCH /api/work-orders                     (work_orders.claim — OPEN TEST row)
 */

/* ── queue ───────────────────────────────────────────────────────────── */

/** The slice of the `listShape=queue` wire row this tile reads. */
export interface OrdersQueueRow {
  readonly id: number;
  readonly order_id: string;
  readonly product_title: string | null;
  readonly sku: string | null;
  readonly item_number: string | null;
  readonly quantity: string | null;
  readonly condition: string | null;
  readonly status: string | null;
  readonly account_source: string | null;
  readonly ship_by_date: string | null;
  readonly deadline_at: string | null;
  readonly tracking_number: string | null;
  readonly is_urgent: boolean;
  readonly is_out_of_stock: boolean;
  readonly row_flag: string | null;
  readonly note_count: number;
  readonly is_shipped: boolean;
  readonly latest_status_label: string | null;
  readonly carrier: string | null;
}

/** Stage facet of `/api/orders` (`sqlOrderHasTechScan` grain): pending = not
 *  yet tested, tested = tech scan exists, all = no stage clause. */
export type OrdersQueueStage = 'pending' | 'tested' | 'all';

export interface OrdersQueuePage {
  readonly rows: readonly OrdersQueueRow[];
  readonly count: number;
}

export async function fetchOrdersQueue(
  stage: OrdersQueueStage,
  limit = 100,
): Promise<OrdersQueuePage> {
  const params = new URLSearchParams({ listShape: 'queue', limit: String(limit) });
  if (stage !== 'all') params.set('stage', stage);
  const res = await fetch(`/api/orders?${params}`);
  if (!res.ok) throw new Error(`queue ${res.status}`);
  const body = (await res.json()) as { orders?: OrdersQueueRow[]; count?: number };
  const rows = Array.isArray(body.orders) ? body.orders : [];
  return { rows, count: typeof body.count === 'number' ? body.count : rows.length };
}

/* ── detail ──────────────────────────────────────────────────────────── */

export interface OrderActivityEntry {
  readonly event_at: string | null;
  readonly work_type: string;
  readonly status: string;
  readonly actor_id: number | null;
  readonly actor_name: string | null;
}

export interface OrderDetail {
  readonly id: number;
  readonly order_id: string;
  readonly product_title: string | null;
  readonly sku: string | null;
  readonly condition: string | null;
  readonly status: string | null;
  readonly quantity: string | null;
  readonly account_source: string | null;
  readonly created_at: string | null;
  readonly item_number: string | null;
  readonly customer_name: string | null;
  readonly ship_by_date: string | null;
  readonly tracking_numbers: readonly string[];
  readonly serials: readonly string[];
  readonly note_count: number;
}

export interface OrderDetailVM {
  readonly order: OrderDetail;
  readonly activity: readonly OrderActivityEntry[];
  /** From the record route — the lookup VM does not carry the flag. */
  readonly isUrgent: boolean;
  readonly isOutOfStock: boolean;
}

/** `orderKey` is the human order # (or a carrier tracking string — the lookup
 *  route resolves both). */
export async function fetchOrderDetail(orderKey: string): Promise<OrderDetailVM | null> {
  const res = await fetch(`/api/orders/lookup/${encodeURIComponent(orderKey)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const body = (await res.json()) as {
    ok: boolean;
    order: OrderDetail;
    activity: OrderActivityEntry[];
  };
  if (!body.ok || !body.order) return null;

  // The urgency flag rides the canonical record route; a miss there degrades
  // to "not urgent" rather than failing the whole detail.
  let isUrgent = false;
  let isOutOfStock = false;
  try {
    const rec = await fetch(`/api/orders/${body.order.id}`);
    if (rec.ok) {
      const recBody = (await rec.json()) as {
        order?: { is_urgent?: boolean; is_out_of_stock?: boolean };
      };
      isUrgent = Boolean(recBody.order?.is_urgent);
      isOutOfStock = Boolean(recBody.order?.is_out_of_stock);
    }
  } catch {
    /* degrade */
  }

  return { order: body.order, activity: body.activity ?? [], isUrgent, isOutOfStock };
}

/* ── notes ───────────────────────────────────────────────────────────── */

export interface OrderNote {
  readonly id: string;
  readonly noteText: string;
  readonly authorName: string | null;
  readonly createdAt: string | null;
}

export async function fetchOrderNotes(orderPk: number): Promise<readonly OrderNote[]> {
  const res = await fetch(`/api/orders/${orderPk}/notes`);
  if (!res.ok) throw new Error(`notes ${res.status}`);
  const body = (await res.json()) as { notes?: OrderNote[] };
  return Array.isArray(body.notes) ? body.notes : [];
}

export async function appendOrderNote(orderPk: number, noteText: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderPk}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noteText }),
  });
  if (!res.ok) throw new Error(`note ${res.status}`);
}

/** The composer writes notes from OUTSIDE the tile (the write-target path);
 *  this nudge tells a mounted detail to refetch its trail. */
export const ORDERS_TILE_NOTE_EVENT = 'orders-tile:note-appended';

export function dispatchOrdersTileNoteAppended(orderPk: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ORDERS_TILE_NOTE_EVENT, { detail: { orderPk } }));
}

/* ── verbs ───────────────────────────────────────────────────────────── */

export async function setOrderUrgent(orderPk: number, urgent: boolean): Promise<void> {
  const res = await fetch('/api/orders/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds: [orderPk], isUrgent: urgent }),
  });
  if (!res.ok) throw new Error(`urgency ${res.status}`);
}

/** Does this order already have a LIVE test-lane work order? Derived from
 *  the lookup's activity strip — the same rows the detail renders, which is
 *  the assignment truth for THIS order (the `/api/work-orders` queue feed is
 *  a filtered view and silently omits old orders — checking it let a spawn
 *  UPDATE an active row and null its assigned tech; found the hard way,
 *  2026-08-24). 20s lookup-cache staleness is the accepted residual risk. */
export function hasActiveTestWork(activity: readonly OrderActivityEntry[]): boolean {
  return activity.some(
    (a) =>
      a.work_type === 'TEST' &&
      (a.status === 'OPEN' || a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS'),
  );
}

/** Spawn the order's work order: an OPEN TEST assignment in the one queue.
 *
 *  CALLERS MUST GATE ON `hasActiveTestWork` FIRST — `PATCH /api/work-orders`
 *  UPDATES an existing active TEST row, including nulling its assigned tech.
 *  `notes` is required by contract — it is what makes the insert path fire,
 *  and an unexplained work order is queue noise anyway. */
export async function spawnOrderWorkOrder(orderPk: number, notes: string): Promise<void> {
  const res = await fetch('/api/work-orders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType: 'ORDER',
      entityId: orderPk,
      status: 'OPEN',
      priority: 100,
      notes: notes.trim() || 'Raised from the Orders tile',
    }),
  });
  if (!res.ok) throw new Error(`work order ${res.status}`);
}

/* ── small shared derivations ────────────────────────────────────────── */

/** Whole days past ship-by (null = no ship-by or not late). */
export function daysLate(shipBy: string | null, now: number): number | null {
  if (!shipBy) return null;
  const t = Date.parse(shipBy);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now - t) / 86_400_000);
  return days > 0 ? days : null;
}

export function formatShipBy(shipBy: string | null): string {
  if (!shipBy) return '—';
  const t = Date.parse(shipBy);
  if (!Number.isFinite(t)) return shipBy;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Facts the beam readout paints — icons and numbers, no verbs. */
export interface OrderHeaderFacts {
  readonly orderKey: string;
  readonly orderNumber: string;
  readonly tracking: string | null;
  readonly platform: string | null;
  readonly urgent: boolean;
  readonly type: string | null;
  readonly price: number | null;
  readonly listingHref: string | null;
  readonly claimCount: number | null;
  readonly photoCount: number | null;
}

export function orderVmToHeaderFacts(
  vm: OrderDetailVM,
  platform: string,
  listingHref: string | null,
): OrderHeaderFacts {
  const tracking = vm.order.tracking_numbers[0]?.trim() || null;
  const type = vm.order.status?.trim() || null;
  return {
    orderKey: vm.order.order_id,
    orderNumber: vm.order.order_id,
    tracking,
    platform: platform.trim() || null,
    urgent: vm.isUrgent,
    type,
    price: null,
    listingHref,
    claimCount: null,
    photoCount: null,
  };
}
