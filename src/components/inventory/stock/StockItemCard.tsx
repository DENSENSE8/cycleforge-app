'use client';

import type { ReactNode } from 'react';
import { CopyChip } from '@/components/ui/CopyChip';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { cn } from '@/utils/_cn';
import { stockQtyLevel, stockQtyToneClass } from '@/design-system/tokens/stock-qty';
import { stockLocationFace, stockRecordTitle } from './stock-record';
import { StockPhotoTile } from './StockPhotoTile';

/**
 * The shared Item face for populated and empty stock records (owner
 * 2026-10-08): the big photo is the record's identity, top-left; the title
 * reads beside it, then the SKU, then where it sits: room first (heavier),
 * then the location as a copy chip. The stock is a FLUSH CORNER TAB — a big
 * black block in the card's own top-right corner, no inset, no ring; its other
 * three corners round with the card's radius — its count coloured by the
 * `stock-qty` token (red out, yellow low, white otherwise). The enclosing card must
 * be `relative` (its `overflow-hidden` rounds the tab's top-right with the
 * card). A missing tote, room or stock is never spelled out here; Locations
 * below owns that.
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
  const health = stockQtyLevel(record.qty);

  return (
    // Wraps: on a phone the text drops under the big photo instead of squeezing beside it.
    <div className="flex min-w-0 flex-wrap items-start gap-5 px-4 py-4" data-testid="stock-record-item">
      {counted ? (
        // -top/-right-px: over the card's hairline, so the tab IS the corner.
        <span
          className="absolute -right-px -top-px z-10 flex h-24 min-w-24 items-center justify-center rounded-mode rounded-tr-none bg-black px-5"
          data-testid="stock-record-count"
          data-health={health}
          title={`${record.qty} on hand${health === 'out' ? ' — out of stock' : health === 'low' ? ' — low stock' : ''}`}
        >
          <AnimatedStat
            value={record.qty}
            profile="kpi"
            className={cn('text-5xl font-bold leading-none tabular-nums', stockQtyToneClass(record.qty, { on: 'dark' }))}
          />
        </span>
      ) : null}
      <StockPhotoTile
        stockId={record.stock_id}
        sku={record.sku}
        photoUrl={record.image_url}
        fullPhotoUrl={record.cover_photo_url}
        title={title}
        onChanged={onChanged}
        size="hero"
        verbsOnHeader={record.cover_photo_url != null}
      />
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        {/* Clears the corner tab so a long title never runs under it. */}
        <div className={cn('min-w-0', counted && 'pr-24')}>
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
