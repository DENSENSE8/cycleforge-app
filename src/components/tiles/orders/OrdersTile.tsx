'use client';

/**
 * THE ORDERS TILES — the first true data tiles of the D2 canvas
 * (HANDOFF-orders-first, Step 2). TWO tiles, not one with modes, by hard
 * rule (operator, 2026-08-24): opening a display NEVER overrides another
 * tile's surface — it always lands as its own tile, and re-opening a display
 * that already has a tile goes to that (most relevant) tile instead of
 * stacking a duplicate. The queue is always the queue; a focused order is
 * always its own tile beside it.
 *
 *   OrdersQueueTile   ref `orders` — the live queue (`listShape=queue`),
 *                     stage facets as deterministic chips, a TILE-LOCAL
 *                     filter (I6's carve-out — legal only inside a mounted
 *                     queue surface). Row click ASKS THE HOST to open the
 *                     order's own tile; it changes nothing about itself.
 *   OrderDetailTile   ref `order:<orderKey>` — one focused order: identity,
 *                     stock verdict, fulfillment, activity, the append-only
 *                     note trail, and the verbs.
 *
 * HOST-AGNOSTIC: no shell imports. The host (today `TileBody`; tomorrow the
 * rebuilt canvas) wires the callbacks, so re-parenting is a re-parent, not a
 * rewrite.
 *
 * Verbs (00-endgame §3, the desk-triage role): read the queue · check stock
 * before shipping (the stock line renders the verdict before the tracking) ·
 * flag urgency · comment (through the composer — this file mounts no
 * free-text note input; One Field holds) · spawn a work order.
 *
 * M1: every state change is a conditional render or a colour — nothing
 * animates geometry.
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OrderIdChip, PlatformChip, TrackingChip } from '@/components/ui/id-chip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getLast8 } from '@/lib/copy-chip-format';
import { getOrderPlatformLabel } from '@/utils/order-platform';
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';
import {
  ORDERS_TILE_NOTE_EVENT,
  daysLate,
  fetchOrderDetail,
  fetchOrderNotes,
  fetchOrdersQueue,
  formatShipBy,
  hasActiveTestWork,
  orderVmToHeaderFacts,
  setOrderUrgent,
  spawnOrderWorkOrder,
  type OrderDetailVM,
  type OrderHeaderFacts,
  type OrderNote,
  type OrdersQueueRow,
  type OrdersQueueStage,
} from './orders-tile-data';

/** What the host needs to know about a resolved order detail — the
 *  composer's write-target follows the focused detail TILE. */
export interface OrdersTileFocus {
  readonly entityId: number;
  readonly orderKey: string;
  readonly title: string;
}

const STAGES: readonly { key: OrdersQueueStage; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'tested', label: 'Tested' },
  { key: 'all', label: 'All' },
];

function rowMatches(row: OrdersQueueRow, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    row.order_id.toLowerCase().includes(q) ||
    (row.product_title ?? '').toLowerCase().includes(q) ||
    (row.sku ?? '').toLowerCase().includes(q) ||
    (row.item_number ?? '').toLowerCase().includes(q) ||
    (row.tracking_number ?? '').toLowerCase().includes(q)
  );
}

/* ── the queue tile ──────────────────────────────────────────────────── */

export function OrdersQueueTile({
  onOpenOrder,
  filter,
}: {
  /** Row click — the host opens (or refocuses) the order's OWN tile. */
  onOpenOrder: (orderKey: string) => void;
  /** Narrowing text, SET THROUGH THE MAIN COMPOSER (`filter: …` — operator
   *  hard rule 2026-08-24: the tile-local filter input is gone; the main
   *  composer is the input method for everything, filtering included). */
  filter: string;
}) {
  const [stage, setStage] = useState<OrdersQueueStage>('pending');
  const [rows, setRows] = useState<readonly OrdersQueueRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    fetchOrdersQueue(stage)
      .then((page) => {
        if (!alive) return;
        setRows(page.rows);
        setCount(page.count);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [stage]);

  const now = Date.now();
  const visible = rows?.filter((r) => rowMatches(r, filter.trim())) ?? [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        <ToggleGroup aria-label="Stage">
          {STAGES.map((s) => (
            <ToggleGroupItem
              key={s.key}
              active={stage === s.key}
              onClick={() => setStage(s.key)}
            >
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* The filter READOUT — never an input. `filter: …` in the main
            composer narrows this queue; `filter:` alone clears it. */}
        {filter ? (
          <Badge
            variant="outline"
            className="mono min-w-0 truncate border-edge-accent text-ink-accent"
            title="Set via the composer — filter: …"
          >
            filter: {filter}
          </Badge>
        ) : null}
        <span className="mono ml-auto shrink-0 text-technical text-muted-foreground">
          {rows ? `${visible.length}/${count}` : '…'}
        </span>
      </div>

      {error ? (
        <div className="p-2 text-xs text-muted-foreground">Queue failed to load ({error}) — retry by switching stage.</div>
      ) : rows === null ? (
        <div className="p-2 text-xs text-muted-foreground">Loading the queue…</div>
      ) : visible.length === 0 ? (
        <div className="p-2 text-xs text-muted-foreground">No orders match.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-xs" />
                <th className="col-s">order</th>
                <th>product</th>
                <th className="col-s">tracking</th>
                <th className="col-xs">qty</th>
                <th className="col-xs">cond</th>
                <th className="col-s">ship by</th>
                <th className="col-s">status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const late = daysLate(row.ship_by_date, now);
                const mark = row.is_urgent
                  ? 'err'
                  : row.is_out_of_stock || late !== null
                    ? 'warn'
                    : 'ok';
                return (
                  <tr key={row.id} className="cursor-pointer" onClick={() => onOpenOrder(row.order_id)}>
                    <td>
                      <span
                        className={`status-dot ${mark}`}
                        title={
                          row.is_urgent
                            ? 'Urgent'
                            : row.is_out_of_stock
                              ? 'Out of stock'
                              : late !== null
                                ? `${late}d past ship-by`
                                : 'On target'
                        }
                      />
                    </td>
                    {/* Q4: typed ids render by their LAST 8 — the chip owns
                        the face, the copy verb, and the platform ink; a
                        chip click never opens the row. */}
                    <td>
                      <OrderIdChip
                        orderId={row.order_id}
                        platformLabel={getOrderPlatformLabel(row.order_id, row.account_source)}
                      />
                    </td>
                    <td title={row.product_title ?? undefined}>{row.product_title ?? '—'}</td>
                    <td>
                      <TrackingChip value={row.tracking_number} carrier={row.carrier} />
                    </td>
                    <td className="mono">{row.quantity ?? '1'}</td>
                    <td className="mono">{row.condition ?? '—'}</td>
                    <td className="mono">
                      {formatShipBy(row.ship_by_date)}
                      {late !== null ? ` · ${late}d late` : ''}
                    </td>
                    <td>{row.status ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── the order-detail tile ───────────────────────────────────────────── */

export function OrderDetailTile({
  orderKey,
  onOpenProduct,
  narrate,
  onFocusResolved,
  onReleased,
  onHeaderFacts,
}: {
  orderKey: string;
  onOpenProduct: (ref: { sku: string | null; itemNumber: string | null; title: string }) => void;
  narrate: (text: string) => void;
  /** The lookup resolved — the composer's write-target snaps here. */
  onFocusResolved: (focus: OrdersTileFocus) => void;
  /** The tile left the canvas — release the write-target IF it still points
   *  at this order (the host compares; a retargeted tile must not wipe its
   *  successor's claim). */
  onReleased: (orderKey: string) => void;
  /** Beam readout — identity facts live in the header, not this tile. */
  onHeaderFacts: (facts: OrderHeaderFacts | null) => void;
}) {
  const [vm, setVm] = useState<OrderDetailVM | null | 'missing'>(null);
  const [notes, setNotes] = useState<readonly OrderNote[] | null>(null);
  const [busy, setBusy] = useState<'urgent' | 'wo' | null>(null);

  const load = useCallback(() => {
    let alive = true;
    fetchOrderDetail(orderKey)
      .then((detail) => {
        if (!alive) return;
        setVm(detail ?? 'missing');
        if (detail) {
          onFocusResolved({
            entityId: detail.order.id,
            orderKey: detail.order.order_id,
            title: detail.order.product_title ?? '',
          });
          fetchOrderNotes(detail.order.id)
            .then((list) => {
              if (alive) setNotes(list);
            })
            .catch(() => {
              if (alive) setNotes([]);
            });
        }
      })
      .catch(() => {
        if (alive) setVm('missing');
      });
    return () => {
      alive = false;
    };
  }, [orderKey, onFocusResolved]);

  useEffect(() => {
    setVm(null);
    setNotes(null);
    return load();
  }, [load]);

  useEffect(() => () => onReleased(orderKey), [onReleased, orderKey]);

  useEffect(() => {
    if (!vm || vm === 'missing') return;
    const platform = getOrderPlatformLabel(vm.order.order_id, vm.order.account_source);
    onHeaderFacts(
      orderVmToHeaderFacts(
        vm,
        platform,
        getExternalUrlByItemNumber(vm.order.item_number || vm.order.sku),
      ),
    );
  }, [vm, onHeaderFacts]);

  useEffect(() => () => onHeaderFacts(null), [onHeaderFacts, orderKey]);

  /* The composer's write-target path appends notes from outside the tile —
     refetch the trail when its nudge names this order. */
  const orderPk = vm && vm !== 'missing' ? vm.order.id : null;
  useEffect(() => {
    if (orderPk === null) return;
    const onNote = (e: Event) => {
      const detail = (e as CustomEvent).detail as { orderPk?: number } | undefined;
      if (detail?.orderPk !== orderPk) return;
      fetchOrderNotes(orderPk)
        .then(setNotes)
        .catch(() => {});
    };
    window.addEventListener(ORDERS_TILE_NOTE_EVENT, onNote);
    return () => window.removeEventListener(ORDERS_TILE_NOTE_EVENT, onNote);
  }, [orderPk]);

  if (vm === null) return <div className="p-2 text-xs text-muted-foreground">Loading #{orderKey}…</div>;
  if (vm === 'missing') {
    return <div className="p-2 text-xs text-muted-foreground">No order matched “{orderKey}”.</div>;
  }

  const { order, activity, isUrgent, isOutOfStock } = vm;
  const late = daysLate(order.ship_by_date, Date.now());

  const toggleUrgent = () => {
    setBusy('urgent');
    setOrderUrgent(order.id, !isUrgent)
      .then(() => {
        setVm({ ...vm, isUrgent: !isUrgent });
        narrate(`#${order.order_id} — ${!isUrgent ? 'flagged urgent' : 'urgency cleared'}.`);
      })
      .catch(() => narrate(`Could not update urgency on #${order.order_id}.`))
      .finally(() => setBusy(null));
  };

  // A live TEST row means the PATCH would rewrite it (nulling its tech) —
  // the verb disarms instead. Same truth the activity strip shows.
  const testWorkLive = hasActiveTestWork(activity);

  const spawnWo = () => {
    if (testWorkLive) {
      narrate(`#${order.order_id} already has live work in the queue — left untouched.`);
      return;
    }
    setBusy('wo');
    spawnOrderWorkOrder(order.id, `Raised from the Orders tile — #${order.order_id}`)
      .then(() => {
        narrate(`Work order raised for #${order.order_id} — it is in the queue.`);
        load();
      })
      .catch(() => narrate(`Could not raise a work order for #${order.order_id}.`))
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="text-base font-semibold text-foreground">{order.product_title ?? 'Untitled order'}</div>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:self-baseline [&_dt]:font-condensed [&_dt]:text-technical [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-[0.1em] [&_dt]:text-muted-foreground">
          {/* Q4 last-8 faces: order # with the platform's ink, tracking in
              accent — full values ride the title and the click copies. */}
          <dt>Order</dt>
          <dd className="flex items-center gap-2">
            <OrderIdChip
              orderId={order.order_id}
              platformLabel={getOrderPlatformLabel(order.order_id, order.account_source)}
            />
            <PlatformChip label={getOrderPlatformLabel(order.order_id, order.account_source)} />
          </dd>
          {order.tracking_numbers.length > 0 ? (
            <>
              <dt>Tracking</dt>
              <dd className="flex flex-wrap items-center gap-1">
                {order.tracking_numbers.map((t) => (
                  <TrackingChip key={t} value={t} />
                ))}
              </dd>
            </>
          ) : null}
          <dt>SKU</dt>
          <dd>
            {order.sku || order.item_number ? (
              <Button
                variant="link"
                size="sm"
                className="mono h-auto p-0 text-ink-accent"
                title="Open this product as its own tile"
                onClick={() =>
                  onOpenProduct({
                    sku: order.sku || null,
                    itemNumber: order.item_number || null,
                    title: order.product_title ?? '',
                  })
                }
              >
                {order.sku || order.item_number}
              </Button>
            ) : (
              '—'
            )}
          </dd>
          <dt>Qty · cond</dt>
          <dd className="mono">
            {order.quantity ?? '1'} · {order.condition ?? '—'}
          </dd>
          {/* Check stock BEFORE shipping — the verdict ahead of the label. */}
          <dt>Stock</dt>
          <dd>
            {isOutOfStock ? (
              <Badge variant="outline" className="border-edge-warning font-condensed text-technical font-bold uppercase tracking-[0.08em] text-ink-warning">OUT OF STOCK — resolve before shipping</Badge>
            ) : (
              'in stock'
            )}
          </dd>
          <dt>Ship by</dt>
          <dd className="mono">
            {formatShipBy(order.ship_by_date)}
            {late !== null ? ` · ${late}d late` : ''}
          </dd>
          {order.serials.length > 0 ? (
            <>
              <dt>Serials</dt>
              {/* Q4: last-8 faces; the full serial rides the title. */}
              <dd className="mono">
                {order.serials.map((s, i) => (
                  <span key={s} title={s}>
                    {i > 0 ? ' · ' : ''}
                    {getLast8(s)}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          {order.customer_name ? (
            <>
              <dt>Customer</dt>
              <dd>{order.customer_name}</dd>
            </>
          ) : null}
        </dl>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={toggleUrgent}
            title="orders.is_urgent — the whole floor sees this"
          >
            {isUrgent ? 'Clear urgency' : 'Flag urgent'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || testWorkLive}
            onClick={spawnWo}
            title={
              testWorkLive
                ? 'This order already has live work in the queue — see Activity'
                : 'Raise an OPEN work order on this order in the one queue'
            }
          >
            {testWorkLive ? 'Work queued' : 'Work order'}
          </Button>
        </div>

        {activity.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Activity</div>
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {activity.map((a, i) => (
                <li key={i}>
                  <span className="mono">{a.work_type}</span> {a.status.toLowerCase()}
                  {a.actor_name ? ` · ${a.actor_name}` : ''}
                  {a.event_at
                    ? ` · ${new Date(a.event_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Notes</div>
          {notes === null ? (
            <div className="p-2 text-xs text-muted-foreground">Loading notes…</div>
          ) : notes.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">
              No notes yet — type in the composer to add one; this order is its write target.
            </div>
          ) : (
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {notes.map((n) => (
                <li key={n.id}>
                  {n.noteText}
                  <span className="block text-technical text-muted-foreground">
                    {n.authorName ?? 'unknown'}
                    {n.createdAt
                      ? ` · ${new Date(n.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-xs text-muted-foreground">Comment via the composer — prose lands on this order.</div>
        </div>
      </div>
    </div>
  );
}
