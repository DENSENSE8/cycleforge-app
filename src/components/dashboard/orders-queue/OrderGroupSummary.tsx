'use client';

import { Fragment, type ReactNode } from 'react';
import {
  OrderIdChip,
  TrackingCountChip,
  TrackingOrSkuScanChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { RowTitle, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
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
import { GridCellDash, GridDateCellValue } from '@/components/ui/grid-cells';
import { formatQueueRowDateCell, formatSalePrice, queueRowShipBySource, resolveRowStatus, type QueueRowRecord } from './helpers';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { orderRowConditionLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { cn } from '@/utils/_cn';

/**
 * Collapsed header for multi-product orders — the SAME Sheets-like WMS grid as
 * {@link OrdersQueueTableRow}, mapped over the SAME ordered `columns` list
 * (cell-renderer registry), so the group header locks to child rows under any
 * drag-reordered column order. Identity cells are quiet; platform renders the
 * fixed brand mark; each fact stays under its own column header.
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
  /** Ordered column models (already sanitized). Default = canonical order. */
  columns?: readonly OrdersQueueColumn[];
}) {
  const orderChannelLabel = useOrderChannelLabel();
  const isHidden = useIsColumnHidden();
  const showQtyCol = !isHidden('qty');
  const showConditionCol = !isHidden('condition');
  const showStatusCol = !isHidden('status');
  const showPlatform = !isHidden('platform');
  const showOrder = !isHidden('orderid');
  const showTracking = !isHidden('tracking');

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

  // Fulfillment status fold — single lane → that chip; mixed → quiet MIXED.
  const statusMetas = rows.map((r) => resolveRowStatus(r as QueueRowRecord, 'fulfillment'));
  const statusLabels = new Set(statusMetas.map((m) => m.label));
  const groupStatus =
    statusLabels.size === 1
      ? statusMetas[0]
      : statusLabels.size > 1
        ? { label: 'MIXED', description: 'Mixed fulfillment status in this order', pill: 'bg-surface-canvas text-text-muted ring-border-soft', dot: 'bg-border-emphasis' }
        : null;

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
  const orderCell = orderId ? <OrderIdChip value={orderId} display={getLast4(orderId)} plain /> : null;
  const trackingCell =
    trackings.size > 1 ? (
      <TrackingCountChip count={trackings.size} dense={isMobile} />
    ) : trackingValue ? (
      <TrackingOrSkuScanChip value={trackingValue} plain />
    ) : null;

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
  const dataCell = (rule = true) => ordersQueueGridCell({ rule, inset: cellInset });

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
            className={cn(dataCell(rule), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('title') }}
            data-frozen-edge
          >
            <span className="min-w-0 truncate text-role-data text-text-default">
              {platformLabel ? `${platformLabel} · Order ${orderId}` : `Order ${orderId}`}
            </span>
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(rule)}>
            <GridDateCellValue
              label={groupDateCell?.label}
              tooltip={groupDateCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      case 'age':
        // No single age for a fold.
        return (
          <div data-col="age" className={cn(dataCell(rule), 'text-role-caption text-text-faint')} aria-hidden>
            —
          </div>
        );
      case 'status':
        return showStatusCol && groupStatus ? (
          <div data-col="status" className={dataCell(rule)}>
            <HoverTooltip label={groupStatus.description} focusable={false}>
              <span
                className={cn(
                  'inline-flex min-w-0 max-w-full items-center truncate rounded-full inset-chip text-role-micro font-black uppercase tracking-widest ring-1 ring-inset',
                  groupStatus.pill,
                )}
              >
                {groupStatus.label}
              </span>
            </HoverTooltip>
          </div>
        ) : (
          <span className={dataCell(rule)} />
        );
      case 'qty':
        return showQtyCol ? (
          <div data-col="qty" className={cn(dataCell(rule), gridSkin && 'justify-end')}>
            {/* Matches the leaf-row qty / Date-cell type scale. */}
            <span className={cn('min-w-0 truncate tabular-nums text-role-caption', orderRowQtyTone(qtySum))}>
              {qtySum}
            </span>
          </div>
        ) : (
          <span className={dataCell(rule)} />
        );
      case 'condition':
        return showConditionCol ? (
          <div data-col="condition" className={cn(dataCell(rule), 'text-role-eyebrow uppercase text-text-muted')}>
            <span className="min-w-0 truncate">
              <RowConditionMeta condition={conditionText} />
            </span>
          </div>
        ) : (
          <span className={dataCell(rule)} />
        );
      case 'platform':
        // Listing-link cell — mirrors the leaf-row rule: on the grid, a fold
        // with no listing link shows a quiet dash (FBA keeps its channel mark).
        return (
          <div data-col="platform" className={dataCell(rule)}>
            {!showPlatform ? null : gridSkin && !productPageUrl && !isFba ? (
              <GridCellDash />
            ) : (
              platformCell
            )}
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(rule)}>
            {showOrder ? orderCell : null}
          </div>
        );
      case 'tracking':
        return (
          <div data-col="tracking" className={dataCell(rule)}>
            {showTracking ? trackingCell : null}
          </div>
        );
      default:
        return <span className={dataCell(rule)} />;
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
