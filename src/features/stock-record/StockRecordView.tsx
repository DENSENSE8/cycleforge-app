'use client';

/**
 * ONE warehouse stock record — the pair `<location>:<sku>:<source>` — painted
 * the same on the desk (`/inventory/stock?open=`, `StockLedger`'s record
 * plane) and on the phone (`/m/stock/detail?open=`, inside its
 * `DetailRecordFrame`). Owner 2026-09-30: the phone edits everything the desk
 * record edits, with the SAME components.
 *
 * - An empty location → `StockAddForm` in record mode (Pair Zoho SKU, count,
 *   **Create TMP SKU**); a landed add re-opens the new pair (`onOpenKey`).
 * - A stocked pair → `StockEvidence` (item card with Upload · Phone, home
 *   tote, Locations with count controls + Add location, Photos, Send to
 *   staff, Movement). A `TMP-` placeholder swaps its work column for the
 *   SKU exception's own (`SkuExceptionEvidence`: title + description, Pair
 *   to Zoho SKU) and leads the aside with its facts (`SkuExceptionFacts`),
 *   kept live by the SKU-exception realtime feed.
 *
 * `DeskRecordLayout` stacks main then aside below its container breakpoint,
 * so the phone reads it as one column.
 */

import { useProvisionalSku, useSkuExceptionsRealtime } from '@/hooks/useProvisionalSkus';
import { locationStockRowId, type LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { SkuExceptionEvidence, SkuExceptionFacts } from '@/components/inventory/sku-exceptions/SkuExceptionEvidence';
import { StockAddForm } from '@/components/inventory/stock/StockAddForm';
import { StockEvidence } from '@/components/inventory/stock/StockEvidence';
import { StockRecordActions } from '@/components/inventory/stock/StockRecordActions';

export interface StockRecordViewProps {
  /** The open pair, or null when the link names a pair no longer listed. */
  record: LocationStockTableRow | null;
  /** The loaded pairs — what a location holds now (the empty record's add writes the difference). Defaults to the record alone. */
  rows?: readonly LocationStockTableRow[];
  /** A write landed on this record — re-read the loader. */
  onChanged: () => void;
  /** The record became another pair (a SKU landed at this empty location) — open it by key. */
  onOpenKey: (key: string, sku: string) => void;
  /** Leave the record (a completed pair merged it away). */
  onClose: () => void;
  /** Desk paints the verbs in the title row. Phone keeps them here. */
  showActions?: boolean;
}

export function StockRecordView({ record, rows, onChanged, onOpenKey, onClose, showActions = true }: StockRecordViewProps) {
  const provisional = useProvisionalSku(record?.is_provisional ? record.sku : null);
  useSkuExceptionsRealtime();

  if (record?.source === 'empty') {
    return (
      <StockAddForm
        key={locationStockRowId(record)}
        rows={rows ?? [record]}
        record={record}
        onAdded={(sku) => {
          if (sku && record.location_id != null) {
            onOpenKey(`${record.location_id}:${sku}:bin`, sku);
            return;
          }
          onChanged();
          onClose();
        }}
        onClose={onClose}
      />
    );
  }
  if (!record) return null;

  const elsewhereQty =
    rows?.filter((row) => row.sku === record.sku && row.location_id !== record.location_id && row.qty > 0).length ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {showActions ? (
        <StockRecordActions
          record={record}
          onChanged={onChanged}
          onPaired={() => {
            onClose();
            onChanged();
          }}
        />
      ) : null}
      <StockEvidence
      record={record}
      onCounted={onChanged}
      elsewhereQty={elsewhereQty}
      placeholder={
        record?.is_provisional
          ? {
              main: (itemRow) => (
                <SkuExceptionEvidence
                  sku={record.sku}
                  item={provisional.data}
                  loading={provisional.isLoading}
                  error={provisional.isError ? provisional.error : null}
                  mergedInto={provisional.mergedInto}
                  itemRow={itemRow}
                  pairAfterItem
                  hidePair
                  onExit={() => {
                    onClose();
                    onChanged();
                  }}
                />
              ),
              aside: provisional.data ? <SkuExceptionFacts item={provisional.data} /> : null,
            }
          : undefined
      }
      />
    </div>
  );
}
