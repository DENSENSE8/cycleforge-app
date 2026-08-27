'use client';

import { OrderIdChip, SkuScanRefChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { getDaysLateNullable, getDaysLateTone } from '@/utils/date';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { CaptureStackRow } from '@/design-system/components/capture-stack';
import { RowTitle, RowMetaColumns, META_COL, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { sourcePlatformMeta } from '@/lib/source-platform';

/**
 * Pending-order row for the mobile Picks / Checklists feeds — the phone view of
 * the dashboard `?pending=` table. Mirrors MobileReceivingRow / MobilePackingRow:
 * same CaptureStackRow chrome + shared CopyChips, so all mobile displays share
 * one set of primitives.
 *
 *   Row 1: deadline-tone dot + product title
 *   Row 2: [qty • condition • days-late] … [item #?] [order] [tracking]
 *
 * Default chips: order# + tracking. Pass `showItemNumber` for checklist queues
 * where the marketplace item id is the filter key. Deadline shows just the
 * days-late number, tone-coloured, exactly like the dashboard pending queue.
 */

function deadlineOf(o: ShippedOrder): string | null {
  return o.ship_by_date || o.deadline_at || null;
}

/** Status dot bg by days late — mirrors getDaysLateTone progressive SLA. */
function dotTone(daysLate: number | null): string {
  if (daysLate === null) return 'bg-surface-strong';
  if (daysLate >= 8) return 'bg-rose-500';
  if (daysLate >= 3) return 'bg-amber-500';
  if (daysLate >= 1) return 'bg-amber-400';
  return 'bg-surface-strong';
}

export function PendingOrderRow({
  row,
  variant,
  fresh = false,
  onTap,
  showItemNumber = false,
}: {
  row: ShippedOrder;
  variant: 'collapsed' | 'expanded';
  fresh?: boolean;
  onTap: () => void;
  /** Checklist queue: show marketplace item # beside order / tracking chips. */
  showItemNumber?: boolean;
}) {
  const productTitle = row.product_title || row.item_number || row.sku || 'Untitled order';
  const quantity = parseInt(String(row.quantity || '1'), 10) || 1;
  const orderId = (row.order_id || '').trim();
  const trackingValue = (row.shipping_tracking_number || '').trim();
  const itemNumber = (row.item_number || '').trim();

  const daysLate = getDaysLateNullable(deadlineOf(row));
  const platformMeta = sourcePlatformMeta(row.account_source);

  return (
    <CaptureStackRow variant={variant} fresh={fresh} onTap={onTap} dataAttr={{ name: 'order-row-id', value: row.id }}>
      {/* Title — same primitive + wide dot-track as receiving/packing so the dot
          and title start at the identical x across every mobile feed. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <RowTitle dot={dotTone(daysLate)} dotTrack={META_COL.dotTrackWide} title={productTitle} />
        </div>
        {platformMeta.value ? (
          <HoverTooltip label={platformMeta.label} asChild focusable={false}>
            <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
              <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
            </span>
          </HoverTooltip>
        ) : null}
      </div>

      <div className="pointer-events-auto mt-0.5 flex items-center gap-2">
        <RowMetaColumns
          className="!mt-0 shrink-0"
          indent={META_COL.indentWide}
          qtyCol={META_COL.qtyColWide}
          qty={<span className={orderRowQtyTone(quantity)}>{quantity}</span>}
          condition={<RowConditionMeta condition={row.condition} />}
          rest={
            daysLate !== null ? (
              <span className={`font-mono tabular-nums ${getDaysLateTone(daysLate)}`}>{daysLate}</span>
            ) : undefined
          }
        />

        <div className="ml-auto flex min-w-0 items-center gap-2 pointer-events-auto">
          {showItemNumber && itemNumber ? (
            <SkuScanRefChip value={itemNumber} display={getLast8(itemNumber)} />
          ) : null}
          {orderId && <OrderIdChip value={orderId} display={getLast8(orderId)} />}
          {trackingValue && <TrackingChip value={trackingValue} display={getLast8(trackingValue)} />}
        </div>
      </div>
    </CaptureStackRow>
  );
}
