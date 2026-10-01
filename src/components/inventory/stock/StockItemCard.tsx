'use client';

import type { ReactNode } from 'react';
import { Copy } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import { CopyChip } from '@/components/ui/CopyChip';
import { SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { cn } from '@/utils/_cn';
import { stockLocationFace, stockRecordTitle } from './stock-record';
import { StockPhotoTile } from './StockPhotoTile';


/** The shared Item face for populated and empty stock records. */
export function StockItemCard({
  record,
  titleContent,
  skuContent,
  photoTitle,
  showSku = true,
  onChanged,
  elsewhereQty = 0,
}: {
  record: LocationStockTableRow;
  titleContent?: ReactNode;
  skuContent?: ReactNode;
  photoTitle?: string;
  showSku?: boolean;
  onChanged?: () => void;
  /** Same SKU at OTHER locations now — separates "nothing anywhere" from "stocked elsewhere". */
  elsewhereQty?: number;
}) {
  const face = stockLocationFace(record);
  const title = (photoTitle ?? stockRecordTitle(record)) || 'Add SKU';
  // One sentence per empty shape (owner 2026-09-30): no stock HERE vs no stock
  // ANYWHERE vs no tote assigned. Never a bare zero.
  const emptyLine =
    record.qty > 0
      ? null
      : elsewhereQty > 0
        ? `Nothing here — ${elsewhereQty} at other location${elsewhereQty === 1 ? '' : 's'}`
        : record.sku
          ? 'Nothing here'
          : null;

  return (
    <div className="flex min-w-0 items-start gap-4 px-4 py-3" data-testid="stock-record-item">
      <StockPhotoTile
        stockId={record.stock_id}
        sku={record.sku}
        photoUrl={record.image_url}
        fullPhotoUrl={record.cover_photo_url}
        title={title}
        onChanged={onChanged}
        showVerbs={false}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid="stock-record-location">
          {face ? (
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="min-w-0 truncate font-mono text-[17px] font-semibold leading-tight tracking-tight text-text-default">
                {face}
              </span>
              <IconButton
                icon={<Copy className="size-3.5" aria-hidden />}
                ariaLabel={`Copy barcode ${record.location_barcode ?? face}`}
                title="Copy raw barcode"
                size="xs"
                radius="pill"
                tone="neutral"
                className="self-center"
                onClick={() => {
                  const code = record.location_barcode ?? face;
                  void navigator.clipboard.writeText(code).then(
                    () => toast.success(`Copied ${code}`),
                    () => toast.error('Could not copy the barcode.'),
                  );
                }}
                data-testid="stock-record-copy-barcode"
              />
            </span>
          ) : (
            <span className="text-[17px] font-semibold leading-tight text-text-warning">No tote</span>
          )}
          <span className={cn('truncate text-xs font-medium', record.room ? 'text-text-muted' : 'text-text-warning')}>
            {record.room ?? 'No room'}
          </span>
        </div>
        {emptyLine ? (
          <p className="text-xs font-semibold text-text-warning" data-testid="stock-record-empty-line">
            {emptyLine}
          </p>
        ) : null}
        {titleContent ?? (
          <p
            className="line-clamp-2 min-w-0 text-[13px] font-normal leading-snug text-text-soft [overflow-wrap:anywhere]"
            title={title}
            data-testid="stock-record-item-title"
          >
            {title}
          </p>
        )}
        {showSku ? (
          skuContent ?? (
            <span className="flex min-w-0 items-center gap-1">
              <CopyChip value={record.sku} display={record.sku} tone="sku" fitDisplayWidth />
              <SkuOpenInMenu sku={record.sku} />
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
