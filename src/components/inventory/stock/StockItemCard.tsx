'use client';

import type { ReactNode } from 'react';
import { CopyChip } from '@/components/ui/CopyChip';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { cn } from '@/utils/_cn';
import { stockLocationFace, stockRecordTitle } from './stock-record';
import { StockPhotoTile } from './StockPhotoTile';

/**
 * The shared Item face for populated and empty stock records, read in an F
 * (owner 2026-10-05): the title leads top-left, the stock count is the big
 * headline top-right of the same line, then the SKU, then where it sits —
 * room first (heavier), then the location as a copy chip. A missing tote,
 * room or stock is never spelled out here; Locations below owns that.
 */
export function StockItemCard({
  record,
  titleContent,
  skuContent,
  photoTitle,
  showSku = true,
  onChanged,
}: {
  record: LocationStockTableRow;
  titleContent?: ReactNode;
  skuContent?: ReactNode;
  photoTitle?: string;
  showSku?: boolean;
  onChanged?: () => void;
}) {
  const face = stockLocationFace(record);
  const title = (photoTitle ?? stockRecordTitle(record)) || 'Add SKU';
  const provisional = record.is_provisional || isProvisionalSku(record.sku);
  // An empty location's add form has no count of its own yet.
  const counted = record.source !== 'empty';

  return (
    <div className="flex min-w-0 items-start gap-4 px-4 py-3" data-testid="stock-record-item">
      <StockPhotoTile
        stockId={record.stock_id}
        sku={record.sku}
        photoUrl={record.image_url}
        fullPhotoUrl={record.cover_photo_url}
        title={title}
        onChanged={onChanged}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="min-w-0 flex-1">
            {titleContent ?? (
              <p
                className="line-clamp-2 min-w-0 text-role-title font-semibold leading-snug text-text-default [overflow-wrap:anywhere]"
                title={title}
                data-testid="stock-record-item-title"
              >
                {title}
              </p>
            )}
          </div>
          {counted ? (
            <div className="flex shrink-0 flex-col items-end" data-testid="stock-record-count">
              <AnimatedStat
                value={record.qty}
                profile="kpi"
                className={cn(
                  'text-role-display font-semibold leading-none tabular-nums',
                  record.qty > 0 ? 'text-text-default' : 'text-text-warning',
                )}
              />
              <span className="mt-1 text-role-caption font-medium text-text-muted">on hand</span>
            </div>
          ) : null}
        </div>
        {showSku ? (
          skuContent ?? (
            <span className="flex min-w-0 items-center gap-1">
              <CopyChip value={record.sku} display={record.sku} tone="sku" fitDisplayWidth />
              {provisional ? null : <SkuOpenInMenu sku={record.sku} />}
            </span>
          )
        ) : null}
        {face || record.room ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5" data-testid="stock-record-location">
            {record.room ? (
              <span className="truncate text-role-data font-semibold text-text-default">{record.room}</span>
            ) : null}
            {face ? (
              <CopyChip
                value={record.location_barcode ?? face}
                display={face}
                tone="bin"
                fitDisplayWidth
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
