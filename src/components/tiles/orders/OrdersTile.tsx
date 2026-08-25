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
}: {
  /** Row click — the host opens (or refocuses) the order's OWN tile. */
  onOpenOrder: (orderKey: string) => void;
}) {
  const [stage, setStage] = useState<OrdersQueueStage>('pending');
  const [rows, setRows] = useState<readonly OrdersQueueRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

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
    <div className="orders-tile">
      <div className="orders-tile-bar">
        <div className="composer-toggle" role="tablist" aria-label="Stage">
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={stage === s.key}
              className={stage === s.key ? 'active' : undefined}
              onClick={() => setStage(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Tile-local filter — I6's carve-out: inside a mounted queue
            surface only. It narrows THIS tile; the org search stays in
            the One Field. */}
        <input
          className="orders-tile-filter"
          type="search"
          placeholder="Filter this queue…"
          aria-label="Filter this queue"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="orders-tile-count mono">
          {rows ? `${visible.length}/${count}` : '…'}
        </span>
      </div>

      {error ? (
        <div className="tile-note">Queue failed to load ({error}) — retry by switching stage.</div>
      ) : rows === null ? (
        <div className="tile-note">Loading the queue…</div>
      ) : visible.length === 0 ? (
        <div className="tile-note">No orders match.</div>
      ) : (
        <div className="orders-tile-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-xs" />
                <th className="col-s">order</th>
                <th>product</th>
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
                  <tr key={row.id} onClick={() => onOpenOrder(row.order_id)}>
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
                    <td className="mono">{row.order_id}</td>
                    <td title={row.product_title ?? undefined}>{row.product_title ?? '—'}</td>
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

  if (vm === null) return <div className="tile-note">Loading #{orderKey}…</div>;
  if (vm === 'missing') {
    return <div className="tile-note">No order matched “{orderKey}”.</div>;
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
    <div className="orders-tile">
      <div className="orders-tile-scroll orders-detail">
        <div className="orders-detail-title">{order.product_title ?? 'Untitled order'}</div>

        <dl className="orders-facts">
          <dt>SKU</dt>
          <dd>
            {order.sku || order.item_number ? (
              <button
                type="button"
                className="orders-link mono"
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
              </button>
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
              <span className="orders-chip warn">OUT OF STOCK — resolve before shipping</span>
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
              <dd className="mono">{order.serials.join(' · ')}</dd>
            </>
          ) : null}
          {order.customer_name ? (
            <>
              <dt>Customer</dt>
              <dd>{order.customer_name}</dd>
            </>
          ) : null}
        </dl>

        <div className="orders-verbs">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy !== null}
            onClick={toggleUrgent}
            title="orders.is_urgent — the whole floor sees this"
          >
            {isUrgent ? 'Clear urgency' : 'Flag urgent'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy !== null || testWorkLive}
            onClick={spawnWo}
            title={
              testWorkLive
                ? 'This order already has live work in the queue — see Activity'
                : 'Raise an OPEN work order on this order in the one queue'
            }
          >
            {testWorkLive ? 'Work queued' : 'Work order'}
          </button>
        </div>

        {activity.length > 0 ? (
          <div className="orders-band">
            <div className="recent-band-label standalone">Activity</div>
            <ul className="orders-trail">
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

        <div className="orders-band">
          <div className="recent-band-label standalone">Notes</div>
          {notes === null ? (
            <div className="tile-note">Loading notes…</div>
          ) : notes.length === 0 ? (
            <div className="tile-note">
              No notes yet — type in the composer to add one; this order is its write target.
            </div>
          ) : (
            <ul className="orders-trail">
              {notes.map((n) => (
                <li key={n.id}>
                  {n.noteText}
                  <span className="orders-trail-meta">
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
          <div className="tile-hint">Comment via the composer — prose lands on this order.</div>
        </div>
      </div>
    </div>
  );
}
