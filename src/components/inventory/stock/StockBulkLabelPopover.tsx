'use client';

/**
 * Inventory › Stock list › selection bar › **Print label** (operator
 * 2026-10-08): one 4 × 6 label per selected card — its SKU's primary photo,
 * title and SKU, no notes. Cards with no SKU and empty places are skipped and
 * the count says so. **Print all** sends the run to the label station as one
 * `stock_label` job; **Browser print** opens ONE 4 × 6 dialog, a page per label.
 */

import { useMemo, type RefObject } from 'react';
import { Popover } from '@/design-system/primitives/Popover';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockRecordTitle } from '@/lib/inventory/stock-record';
import type { StockLabelFace } from '@/lib/print/stockLabel';
import { StockLabelPrintAt, StockLabelPrintButtons } from './StockLabelSteps';
import { recordLabelImage, useStockLabelPrint } from './useStockLabelPrint';

export function StockBulkLabelPopover({
  rows,
  anchorRef,
  onClose,
}: {
  /** The selected cards, in list order. */
  rows: readonly LocationStockTableRow[];
  /** The bar's Print label button: the popover hangs under it. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const print = useStockLabelPrint();
  const faces = useMemo(
    (): StockLabelFace[] =>
      rows
        .filter((row) => row.source !== 'empty' && row.sku.trim() !== '')
        .map((row) => ({ sku: row.sku, title: stockRecordTitle(row), notes: '', image: recordLabelImage(row) })),
    [rows],
  );
  const skipped = rows.length - faces.length;

  return (
    <Popover
      open
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={6}
      level="panelPopover"
      aria-label="Print labels for the selection"
      data-testid="stock-bulk-label-popover"
      className="flex w-[min(22rem,calc(100vw-1rem))] flex-col"
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-text-default" data-testid="stock-bulk-label-count">
            {faces.length} {faces.length === 1 ? 'label' : 'labels'}
          </p>
          <p className="text-role-caption text-text-muted">
            One per selected card, with its SKU&apos;s primary photo.
            {skipped > 0 ? ` ${skipped} skipped — no SKU or an empty place.` : ''}
          </p>
        </div>
        <StockLabelPrintAt print={print} />
      </div>
      <div className="flex items-center justify-end border-t border-border-hairline px-4 py-3">
        <StockLabelPrintButtons print={print} faces={faces} verb="Print all" onPrinted={onClose} />
      </div>
    </Popover>
  );
}
