'use client';

/**
 * The stock record's verbs, one strip: three icon+text buttons and a vertical
 * ⋮ for the rest. A temporary SKU promotes Pair to SKU into that row; it
 * opens the `SkuPairSheet` action over the record, so the record never moves.
 * Upload / Send to phone live on the item's photo tile (`StockPhotoTile`).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Link2, Package, PackageSearch, Send } from '@/components/Icons';
import { RecordTaskForm } from '@/components/tasks/RecordTaskActions';
import { SkuPairSheet } from '@/components/inventory/sku-exceptions/SkuPairSheet';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockLocationFace } from './stock-record';

const GLYPH = 'size-3.5';

export function StockRecordActions({
  record,
  onPaired,
}: {
  record: LocationStockTableRow;
  /** A temporary SKU merged into its permanent SKU — this record no longer exists. */
  onPaired: () => void;
}) {
  const router = useRouter();
  const temporary = record.is_provisional || isProvisionalSku(record.sku);
  const provisional = useProvisionalSku(temporary ? record.sku : null).data ?? null;
  const [taskOpen, setTaskOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const face = stockLocationFace(record);
  const sku = record.sku;

  const verbs = useMemo((): RecordActionVerb[] => {
    const go = (href: string) => () => router.push(href);
    const products: RecordActionVerb = {
      id: 'products',
      label: 'Products',
      icon: <Package className={GLYPH} />,
      hotkey: 'o',
      tone: 'blue',
      disabled: !sku,
      run: go(`/products/sku/${encodeURIComponent(sku)}`),
    };
    const inventory: RecordActionVerb = {
      id: 'inventory',
      label: 'Inventory',
      icon: <PackageSearch className={GLYPH} />,
      hotkey: 'i',
      tone: 'success',
      disabled: !sku,
      run: go(`/inventory/sku/${encodeURIComponent(sku)}`),
    };
    const bin: RecordActionVerb = {
      id: 'bin',
      label: 'Stocked by bin',
      icon: <Box className={GLYPH} />,
      hotkey: 'b',
      tone: 'yellow',
      disabled: !sku,
      run: go(
        record.location_barcode
          ? `/inventory/location/${encodeURIComponent(record.location_barcode)}`
          : `/inventory/stock?q=${encodeURIComponent(sku)}`,
      ),
    };
    const pair: RecordActionVerb = {
      id: 'pair',
      label: 'Pair to SKU',
      icon: <Link2 className={GLYPH} />,
      hotkey: 'z',
      tone: 'yellow',
      disabled: provisional == null,
      disabledReason: 'Loading the temporary SKU',
      run: () => setPairOpen(true),
    };
    const primary = temporary ? [products, inventory, pair] : [products, inventory, bin];
    const overflow: RecordActionVerb[] = [
      ...(temporary ? [bin] : []),
      {
        id: 'staff',
        label: 'Send to staff',
        icon: <Send className={GLYPH} />,
        hotkey: 't',
        run: () => {
          setTaskOpen(true);
        },
      },
    ];
    return [...primary, ...overflow];
  }, [provisional, record.location_barcode, router, sku, temporary]);

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <RecordActionStrip face="inline" verbs={verbs} label={`Stock ${sku || face || 'record'} actions`} testId="stock-record-actions" />
      {temporary ? (
        <SkuPairSheet open={pairOpen} onClose={() => setPairOpen(false)} item={provisional} onPaired={onPaired} />
      ) : null}
      {taskOpen ? (
        <RecordTaskForm
          kind="staff"
          target={{ entityType: null, entityId: null, label: `${face ?? 'No location'} · ${sku || 'No SKU'}` }}
          onDone={() => setTaskOpen(false)}
        />
      ) : null}
    </div>
  );
}
