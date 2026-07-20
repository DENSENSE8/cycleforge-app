'use client';

import {
  OrderIdChip,
  PlatformChip,
  TrackingCountChip,
  TrackingOrSkuScanChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { RowTitle, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import {
  getOrderPlatformColor,
  getOrderPlatformBorderColor,
  isFbaOrder,
} from '@/utils/order-platform';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  ordersQueueGridTemplate,
  ordersQueueRowShellClass,
} from '@/lib/dashboard-order-row-layout';
import { formatSalePrice, type QueueRowRecord } from './helpers';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { orderRowConditionLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

/**
 * Collapsed header for multi-product orders — the SAME Sheets-like 10-column WMS
 * grid as {@link OrdersQueueTableRow}, so the group header locks to child rows.
 * Identity cells are quiet (icon-less) and split platform / order / tracking so
 * each stays under its own column header.
 */
export function OrderGroupSummary({ rows, isMobile }: { rows: ShippedOrder[]; isMobile: boolean }) {
  const orderChannelLabel = useOrderChannelLabel();
  const isHidden = useIsColumnHidden();
  const showQtyCol = !isHidden('qty');
  const showConditionCol = !isHidden('condition');

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

  // Quiet, icon-less identity cells — match the row's `variant="plain"` chips.
  const platformCell =
    !isFba && platformLabel ? (
      <PlatformChip
        label={platformLabel}
        underlineClass={getOrderPlatformBorderColor(platformLabel)}
        iconClass={platformIconClass}
        showIcon={false}
        tooltipValue={productPageUrl ? 'Open listing' : 'No listing link'}
        onClick={() => {
          if (productPageUrl) window.open(productPageUrl, '_blank', 'noopener,noreferrer');
        }}
      />
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

  return (
    <div
      className={cn(ordersQueueRowShellClass(false), 'w-full')}
      style={{ gridTemplateColumns: ordersQueueGridTemplate() }}
    >
      {/* select — empty (grip lives only in the sticky header) */}
      <span aria-hidden />
      {/* status — group dot */}
      <div className="flex items-center justify-center">
        <HoverTooltip label={`${rows.length} products`} focusable={false}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-surface-strong" />
        </HoverTooltip>
      </div>
      <div className="min-w-0">
        <span className="block truncate text-role-data text-text-default">
          {platformLabel ? `${platformLabel} · Order ${orderId}` : `Order ${orderId}`}
        </span>
      </div>
      {showQtyCol ? (
        <span className={cn('font-mono tabular-nums text-role-eyebrow', orderRowQtyTone(qtySum))}>
          {qtySum}
        </span>
      ) : (
        <span />
      )}
      {showConditionCol ? (
        <span className="min-w-0 truncate text-role-eyebrow uppercase text-text-muted">
          <RowConditionMeta condition={conditionText} />
        </span>
      ) : (
        <span />
      )}
      {/* age — none for a group header */}
      <span className="text-role-caption text-text-faint" aria-hidden>—</span>
      {/* notes — none for a group header */}
      <span className="text-role-caption text-text-faint" aria-hidden>—</span>
      <div data-col="platform" className="flex min-w-0 items-center">{platformCell}</div>
      <div data-col="order" className="flex min-w-0 items-center">{orderCell}</div>
      <div data-col="tracking" className="flex min-w-0 items-center">{trackingCell}</div>
    </div>
  );
}
