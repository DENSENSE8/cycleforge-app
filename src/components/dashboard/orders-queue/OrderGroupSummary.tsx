'use client';

import { Fragment, type ReactNode } from 'react';
import {
  OrderIdChip,
  TrackingCountChip,
  TrackingOrSkuScanChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { RowTitle, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import {
  getOrderPlatformColor,
  isFbaOrder,
} from '@/utils/order-platform';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { toPSTDateKey } from '@/utils/date';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_FROZEN_CELL,
  ordersQueueFrozenLeft,
  ordersQueueGridCell,
  ordersQueueGridTemplateFor,
  ordersQueueRowShellClass,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { GridDateCellValue } from '@/components/ui/grid-cells';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { formatQueueRowDateCell, formatSalePrice, queueRowShipBySource, type QueueRowRecord } from './helpers';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { orderRowConditionLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { cn } from '@/utils/_cn';

/**
 * Collapsed header for multi-product orders — the SAME Sheets-like WMS grid as
 * {@link OrdersQueueTableRow}, mapped over the SAME ordered `columns` list
 * (cell-renderer registry), so the group header locks to child rows under any
 * drag-reordered column order. Identity cells are quiet; each fact stays under
 * its own column header. The platform brand mark is a MOBILE-only affordance —
 * the desktop Platform column is retired from both column models.
 *
 * `columns` arrives already RESOLVED to the visible tracks
 * (`useGridColumnVisibility` in `OrdersGridView`), so a hidden column loses its
 * TRACK; this summary never re-tests hidden-ness per cell.
 */
export function OrderGroupSummary({
  rows,
  isMobile,
  gridSkin = false,
  columns = ORDERS_QUEUE_COLUMNS,
}: {
  rows: ShippedOrder[];
  isMobile: boolean;
  /** Airtable grid-view skin. Marks the desktop container `data-grid-summary-row`
   *  so the scoped `[data-grid-skin='airtable']` stylesheet draws the per-cell
   *  spreadsheet gridlines on the collapsed header, matching its child rows. */
  gridSkin?: boolean;
  /** Ordered VISIBLE column models (already sanitized + visibility-resolved).
   *  Default = canonical order. */
  columns?: readonly OrdersQueueColumn[];
}) {
  const orderChannelLabel = useOrderChannelLabel();

  const first = rows[0];
  const orderId = String(first.order_id || '').trim();
  const platformLabel = orderChannelLabel(orderId, first.account_source);
  const isFba = isFbaOrder(orderId, first.account_source);
  const productPageUrl = getExternalUrlByItemNumber(String(first.item_number || '').trim());
  const platformColor = platformLabel ? getOrderPlatformColor(platformLabel) : '';
  const platformIconClass = platformLabel && productPageUrl ? platformColor : 'text-text-soft';

  const qtySum = rows.reduce((sum, r) => sum + (parseInt(String(r.quantity || '1'), 10) || 1), 0);
  const conditions = new Set(rows.map((r) => String(r.condition || '').trim()).filter(Boolean));
  const conditionText =
    conditions.size === 1
      ? orderRowConditionLabel([...conditions][0])
      : conditions.size > 1
        ? 'MIXED'
        : EMPTY_META_DASH;

  const priceSum = rows.reduce((sum, r) => {
    const n = r.sale_amount == null || r.sale_amount === '' ? NaN : Number(r.sale_amount);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const groupPrice = priceSum > 0 ? formatSalePrice(priceSum, rows.find((r) => r.currency)?.currency) : null;

  const trackings = new Set(
    rows
      .map((r) => String(((r as QueueRowRecord).tracking_number as string | undefined) || r.shipping_tracking_number || '').trim())
      .filter(Boolean),
  );
  const trackingValue = trackings.size === 1 ? [...trackings][0] : '';

  // Soonest ship-by civil day among the fold — matches Date column on leaf rows.
  const groupDateKey = rows.reduce<string | null>((best, r) => {
    const src = queueRowShipBySource(r);
    if (!src) return best;
    const key = toPSTDateKey(src);
    if (!key) return best;
    return best == null || key < best ? key : best;
  }, null);
  const groupDateCell = formatQueueRowDateCell(groupDateKey);

  // Fixed brand mark — matches the leaf rows' Platform cell footprint. FBA
  // folds show the FBA mark; label + affordance live in tooltip/sr-only.
  const platformMeta = sourcePlatformMetaFromLabel(isFba ? 'fba' : platformLabel);
  const markLabel = isFba ? 'FBA' : platformLabel || 'No platform';
  const platformCell = platformMeta.value ? (
    <HoverTooltip label={productPageUrl && !isFba ? `${markLabel} — open listing` : markLabel} focusable={false}>
      <button
        type="button"
        aria-label={markLabel}
        disabled={!productPageUrl || isFba}
        onClick={(e) => {
          e.stopPropagation();
          if (productPageUrl && !isFba) window.open(productPageUrl, '_blank', 'noopener,noreferrer');
        }}
        className={cn(
          'ds-raw-button inline-flex items-center justify-center',
          productPageUrl && !isFba ? 'rounded-sm hover:bg-surface-hover' : 'cursor-default',
        )}
      >
        <PlatformMark platformValue={platformMeta.value} textClassName={platformIconClass} />
        <span className="sr-only">{markLabel}</span>
      </button>
    </HoverTooltip>
  ) : null;
  const orderCell = (
    <OrderIdChip value={orderId} display={getLast4(orderId)} plain fitDisplayWidth />
  );
  /** What the collapsed fold IS — the desktop Product cell's line. */
  const foldLabel = `${rows.length} ${rows.length === 1 ? 'product' : 'products'}`;
  const trackingCell =
    trackings.size > 1 ? (
      <TrackingCountChip count={trackings.size} dense={isMobile} />
    ) : (
      <TrackingOrSkuScanChip value={trackingValue} plain />
    );

  if (isMobile) {
    return (
      <div className={ordersQueueRowShellClass(true)}>
        <div className="flex min-w-0 flex-col">
          <RowTitle
            dot="bg-surface-strong"
            dotTitle={`${rows.length} products`}
            title={platformLabel ? `${platformLabel} · Order ${orderId}` : `Order ${orderId}`}
          />
          <div className="mt-0.5 flex items-center gap-2 pl-5 text-role-eyebrow uppercase text-text-muted">
            <span className={cn('font-mono tabular-nums', orderRowQtyTone(qtySum))}>{qtySum}</span>
            <RowConditionMeta condition={conditionText} />
            {groupPrice ? (
              <span className="normal-case tracking-normal text-text-success">{groupPrice}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {platformCell}
          {orderCell}
          {trackingCell}
        </div>
      </div>
    );
  }

  const cellInset = gridSkin ? ('grid' as const) : ('cell' as const);
  const dataCell = (col: OrdersQueueColumn, rule = true) =>
    cn(ordersQueueGridCell({ rule, inset: cellInset }), gridCellAlignClass(col));

  // Per-column registry — mirrors OrdersQueueTableRow's, minus editors.
  const renderCell = (col: OrdersQueueColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        // Empty (grip lives only in the sticky header); carries lead rule.
        return (
          <span
            className={cn(ordersQueueGridCell({ inset: 'none', rule: true }), ORDERS_QUEUE_FROZEN_CELL, 'justify-center')}
            style={{ left: ordersQueueFrozenLeft('select') }}
            aria-hidden
          />
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('title') }}
            data-frozen-edge
          >
            {/* The order id lives in its own pinned Order cell immediately to
                the left, so the Product track says what the FOLD is (how many
                lines) instead of restating the identifier one track over. */}
            <span className="min-w-0 truncate text-role-data text-text-default">
              {platformLabel ? `${platformLabel} · ${foldLabel}` : foldLabel}
            </span>
          </div>
        );
      case 'sla':
        // A fold shares one ship-by day (it is one order), so the date is real
        // here — but its children can be individually late, so the summary
        // shows no aggregate lateness. Expanding the fold is what surfaces
        // per-line urgency; inventing a fold-level `Nd` would be a claim the
        // data does not support.
        return (
          <div data-col="sla" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={groupDateCell?.label}
              tooltip={groupDateCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={dataCell(col, rule)}>
            {/* Matches the leaf-row qty / Date-cell type scale. */}
            <span className={cn('min-w-0 truncate tabular-nums text-role-caption', orderRowQtyTone(qtySum))}>
              {qtySum}
            </span>
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={cn(dataCell(col, rule), 'text-role-eyebrow uppercase text-text-muted')}>
            <span className="min-w-0 truncate">
              <RowConditionMeta condition={conditionText} />
            </span>
          </div>
        );
      case 'order':
        // Identity pane — pinned beside select/title so a scrolled fold header
        // still reads as "which order" (mirrors the leaf rows).
        return (
          <div
            data-col="order"
            className={cn(dataCell(col, rule), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('order') }}
          >
            {orderCell}
          </div>
        );
      case 'tracking':
        return (
          <div data-col="tracking" className={dataCell(col, rule)}>
            {trackingCell}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      className={cn(
        ordersQueueRowShellClass(false, { scrollMinContent: gridSkin }),
        gridSkin && 'px-0',
      )}
      style={{
        gridTemplateColumns: ordersQueueGridTemplateFor(columns),
      }}
      {...(gridSkin ? { 'data-grid-summary-row': '' } : {})}
    >
      {/* Fragments keep cells DIRECT grid children for the skin's border rules. */}
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
}
