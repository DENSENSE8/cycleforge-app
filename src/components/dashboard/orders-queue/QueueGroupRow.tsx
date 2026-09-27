'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import {
  SlotTableGroupFold,
  SlotTableGroupFoldBody,
  SlotTableGroupParentRow,
} from '@/components/tables/compound/SlotTableGroupParentRow';
import type { RowGroup } from '@/lib/group-rows';
import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { orderAdminUrl } from '@/utils/order-platform';
import { ordersCompoundView, ordersEdgeMark, ordersGroupItemStatus } from '@/lib/orders/orders-compound-view';
import { ordersSlotValues } from '@/lib/tables/field-catalog/orders-resolve';
import { lineQtySubtitlePart } from '@/lib/tables/slot-table-line-qty';
import { statusWordRollup, ordersBandStateTone } from '@/lib/receiving/receiving-group-rollup';
import { resolveRowStatus } from './helpers';
import type { OrdersQueueMode, QueueRowRecord } from '@/lib/dashboard/orders-queue-helpers';
import { lineMoneySubtitlePart } from '@/lib/tables/slot-table-line-money';
import { formatCurrency } from '@/utils/_number';
import { getCurrentPSTDateKey } from '@/utils/date';
import { isOrdersIndexColumnModel, type OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { ordersIndexValues } from '@/lib/tables/field-catalog/orders-resolve';
import { queueRowClickIntent, type QueueRowClickEvent } from './queue-row-click';
import { OrdersIndexGroupRow } from './OrdersIndexCells';

interface QueueGroupRowProps {
  /** One order's lines (singleton or multi-product). */
  group: RowGroup<ShippedOrder>;
  /** Zebra-stripe index of this group's first leaf. Children continue locally. */
  baseStripeIndex: number;
  /**
   * Absolute ARIA row index of this group's first leaf. Children follow at
   * `rowIndex + i`. The parent chrome (when painted) is not in this count.
   */
  rowIndex?: number;
  columns: readonly { key: string; width: string; frozen?: boolean }[];
  selectedIds: ReadonlySet<number>;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  /** Render a single queue row at the given zebra-stripe index. */
  renderRow: (
    record: ShippedOrder,
    stripeIndex: number,
    rowIndex?: number,
    quietIdentity?: boolean,
  ) => ReactNode;
  /**
   * Which lane this band sits in. The parent's status pill rolls up
   * `resolveRowStatus(row, queueMode)` — the same resolver its leaves use — so
   * the band and its children can never disagree about the stage.
   */
  queueMode: OrdersQueueMode;
  /**
   * INDEX face only — a click on the order row (not its checkbox or fold).
   * Opens the lead line's record while nothing is checked; toggles the whole
   * order once anything is (Polaris `selectMode`).
   */
  onRowClick?: (record: ShippedOrder, event?: QueueRowClickEvent) => void;
}

/** Commercial totals for the parent band — units and money, not boxes. */
export function parentOrderLineTotals(rows: readonly ShippedOrder[]): {
  qty: number;
  amount: number | null;
} {
  let qty = 0;
  let amount = 0;
  let hasAmount = false;
  for (const row of rows) {
    const lineQty = Number(row.quantity);
    qty += Number.isFinite(lineQty) && lineQty > 0 ? lineQty : 1;
    const lineAmount = Number(row.sale_amount);
    if (Number.isFinite(lineAmount)) {
      amount += lineAmount;
      hasAmount = true;
    }
  }
  return { qty, amount: hasAmount ? amount : null };
}

/**
 * One order group inside a day band.
 * ## The parent stays exactly one row tall (operator 2026-09-05)
 */
export function QueueGroupRow({
  group,
  baseStripeIndex,
  rowIndex,
  columns,
  selectedIds,
  onToggleGroup,
  renderRow,
  queueMode,
  onRowClick,
}: QueueGroupRowProps) {
  const multi = group.rows.length > 1;
  // The index face is one row per ORDER: its lines start folded under it.
  const index = isOrdersIndexColumnModel(columns);
  // A single-line order has nothing to fold — its line IS the order row.
  const [folded, setFolded] = useState(index && multi);
  return (
    <SlotTableGroupFold multi={multi}>
      {multi && index ? (
        <QueueOrderIndexRow
          group={group}
          columns={columns as readonly OrdersQueueColumn[]}
          selectedIds={selectedIds}
          onToggleGroup={onToggleGroup}
          folded={folded}
          onToggleFold={() => setFolded((open) => !open)}
          onRowClick={onRowClick}
        />
      ) : multi ? (
        <QueueOrderParentRow
          group={group}
          columns={columns}
          selectedIds={selectedIds}
          onToggleGroup={onToggleGroup}
          folded={folded}
          onToggleFold={() => setFolded((open) => !open)}
          queueMode={queueMode}
        />
      ) : null}
      {folded ? null : (
        <SlotTableGroupFoldBody multi={multi}>
          {group.rows.map((row, i) =>
            renderRow(
              row,
              baseStripeIndex + i,
              rowIndex == null ? undefined : rowIndex + i,
              multi,
            ),
          )}
        </SlotTableGroupFoldBody>
      )}
    </SlotTableGroupFold>
  );
}

function QueueOrderParentRow({
  group,
  columns,
  selectedIds,
  onToggleGroup,
  folded,
  onToggleFold,
  queueMode,
}: {
  group: RowGroup<ShippedOrder>;
  columns: readonly { key: string; width: string; frozen?: boolean }[];
  selectedIds: ReadonlySet<number>;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  folded: boolean;
  onToggleFold: () => void;
  queueMode: OrdersQueueMode;
}) {
  const ids = group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : 'mixed';
  const lead = group.rows[0]!;
  const orderId = String(lead.order_id || group.key || '').trim();
  const { carriers, boxCount, trackings } = orderCarrierBoxes(group.rows);
  const { qty, amount } = parentOrderLineTotals(group.rows);
  // Status rollup (operator 2026-09-14, item 1):
  // Status rollup (operator 2026-09-14, item 1): the band pill summarizes its
  // column. That was the bug the operator reported on 2026-09-15: five
  const stateRollup = statusWordRollup(
    group.rows.map((row) => resolveRowStatus(row as QueueRowRecord, queueMode)?.label ?? null),
    ordersBandStateTone,
  );
  const view = {
    ...ordersCompoundView(lead, {
      stateLabel: stateRollup.label || null,
      delayDays: null,
      slots: ordersSlotValues(lead, columns),
      subtitleParts: [
        lineQtySubtitlePart('orders.qty', String(qty)),
        lineMoneySubtitlePart(
          'orders.amount',
          amount == null ? null : formatCurrency(amount),
        ),
      ],
    }),
    itemStatus: ordersGroupItemStatus(group.rows),
    edgeMark: ordersEdgeMark({
      has_exception: group.rows.some((row) => Boolean(row.has_exception)),
      is_urgent: group.rows.some((row) => Boolean(row.is_urgent)),
      is_out_of_stock: group.rows.some((row) => Boolean(row.is_out_of_stock)),
    }),
  };
  const orderMeta = resolveMarketplacePlatformMeta(orderId, lead.account_source);

  // Orders supplies FACTS; the band itself is engine-owned so Unbox, Pickup and
  // every other peer paint the identical row (SlotTableGroupParentRow).
  return (
    <SlotTableGroupParentRow
      identity={
        orderId
          ? {
              kind: 'order',
              value: orderId,
              dot: platformMetaBrandDot(orderMeta),
              href: orderAdminUrl(orderId, lead.account_source, lead.admin_url),
              platformLabel: orderMeta.value ? orderMeta.label : null,
            }
          : null
      }
      carriers={carriers}
      boxCount={boxCount}
      trackings={trackings}
      columns={columns}
      identityColumnKey="fulfillment"
      checked={checked}
      onToggle={() => onToggleGroup(ids, checked !== true)}
      selectCount={group.rows.length}
      folded={folded}
      onToggleFold={onToggleFold}
      view={view}
    />
  );
}

/** A multi-line order on the INDEX face — the order's own row, facts summed over its lines. */
function QueueOrderIndexRow({
  group,
  columns,
  selectedIds,
  onToggleGroup,
  folded,
  onToggleFold,
  onRowClick,
}: {
  group: RowGroup<ShippedOrder>;
  columns: readonly OrdersQueueColumn[];
  selectedIds: ReadonlySet<number>;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  folded: boolean;
  onToggleFold: () => void;
  onRowClick?: (record: ShippedOrder, event?: QueueRowClickEvent) => void;
}) {
  const ids = group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : 'mixed';
  const lead = group.rows[0]!;
  const toggle = () => onToggleGroup(ids, checked !== true);
  return (
    <OrdersIndexGroupRow
      columns={columns}
      facts={{
        values: ordersIndexValues(group.rows, columns, { todayKey: getCurrentPSTDateKey() }),
        view: {
          ...ordersCompoundView(lead, { stateLabel: null, delayDays: null }),
          edgeMark: ordersEdgeMark({
            has_exception: group.rows.some((row) => Boolean(row.has_exception)),
            is_urgent: group.rows.some((row) => Boolean(row.is_urgent)),
            is_out_of_stock: group.rows.some((row) => Boolean(row.is_out_of_stock)),
          }),
        },
        orderId: String(lead.order_id || group.key || '').trim(),
        accountSource: lead.account_source ?? null,
        hasNote: group.rows.some(
          (row) => Number(row.note_count ?? 0) > 0 || Boolean(String(row.buyer_note ?? '').trim()),
        ),
      }}
      checked={checked}
      onToggle={toggle}
      lineCount={group.rows.length}
      folded={folded}
      onToggleFold={onToggleFold}
      onActivate={(event: MouseEvent<HTMLDivElement>) => {
        // Same gesture law as a line row (`queueRowClickIntent`), with the
        // ORDER as the unit: a live check-set makes the click check every line.
        const click = {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          detail: event.detail,
          target: event.target,
        };
        const intent = queueRowClickIntent(click, selectedIds.size > 0);
        if (intent === 'toggle') toggle();
        else if (intent !== 'ignore') onRowClick?.(lead, click);
      }}
    />
  );
}
