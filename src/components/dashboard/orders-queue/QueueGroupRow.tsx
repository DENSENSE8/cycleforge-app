'use client';

import { useState, type ReactNode } from 'react';
import { SlotTableGroupParentRow } from '@/components/tables/compound/SlotTableGroupParentRow';
import type { RowGroup } from '@/lib/group-rows';
import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { ordersCompoundView, ordersEdgeMark } from '@/lib/orders/orders-compound-view';
import { ordersSlotValues } from '@/lib/tables/field-catalog/orders-resolve';
import { lineQtySubtitlePart } from '@/lib/tables/slot-table-line-qty';
import { lineMoneySubtitlePart } from '@/lib/tables/slot-table-line-money';
import { formatCurrency } from '@/utils/_number';

export interface QueueGroupRowProps {
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
 *
 * Always-expanded by default. When the fold has more than one line, a thin parent
 * chrome sits above them. A chevron under the select checkbox hides the child
 * lines without dropping the parent identity.
 *
 * ## The parent stays exactly one row tall (operator 2026-09-05)
 *
 * It used to print `N tracking` over one `TrackingNumberMenuChip` per number in
 * the ITEM cell. A stack of chips is taller than the plain two-line cell every
 * leaf paints, so the band bulged out of the sheet's rhythm — a parent that is
 * meant to read as thinner than its children read as heavier instead.
 *
 * The shipment story now lives entirely in the fulfillment cell's second line,
 * at plain text height: one {@link BrandIdentityDot} `variant="ring"` per
 * DISTINCT carrier (USPS blue · UPS brown · FedEx purple, from the carrier
 * brand SoT) followed by the box count. Every cell on this row is pinned to
 * `COMPOUND_ROW_PX`, so nothing here can grow the band.
 *
 * ## Boxes, not lines
 *
 * A tracking number IS a box, and boxes is the word staff use. "Lines" is
 * schema vocabulary and does not belong on the floor. The count on this row is
 * boxes; the only place an item count survives is the checkbox's accessible
 * label, which describes what a click SELECTS rather than what the row says.
 */
export function QueueGroupRow({
  group,
  baseStripeIndex,
  rowIndex,
  columns,
  selectedIds,
  onToggleGroup,
  renderRow,
}: QueueGroupRowProps) {
  const multi = group.rows.length > 1;
  const [folded, setFolded] = useState(false);
  return (
    <>
      {multi ? (
        <QueueOrderParentRow
          group={group}
          columns={columns}
          selectedIds={selectedIds}
          onToggleGroup={onToggleGroup}
          folded={folded}
          onToggleFold={() => setFolded((open) => !open)}
        />
      ) : null}
      {folded
        ? null
        : group.rows.map((row, i) =>
            renderRow(
              row,
              baseStripeIndex + i,
              rowIndex == null ? undefined : rowIndex + i,
              false,
            ),
          )}
    </>
  );
}

function QueueOrderParentRow({
  group,
  columns,
  selectedIds,
  onToggleGroup,
  folded,
  onToggleFold,
}: {
  group: RowGroup<ShippedOrder>;
  columns: readonly { key: string; width: string; frozen?: boolean }[];
  selectedIds: ReadonlySet<number>;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  folded: boolean;
  onToggleFold: () => void;
}) {
  const ids = group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : 'mixed';
  const lead = group.rows[0]!;
  const orderId = String(lead.order_id || group.key || '').trim();
  const { carriers, boxCount, trackings } = orderCarrierBoxes(group.rows);
  const { qty, amount } = parentOrderLineTotals(group.rows);
  const view = {
    ...ordersCompoundView(lead, {
      stateLabel: null,
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
              href: marketplaceOrderUrl(orderId, lead.account_source),
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
