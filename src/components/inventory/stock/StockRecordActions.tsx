'use client';

/**
 * The stock record's Actions panel (under Movement, operator 2026-10-08):
 * Print label (the 4 × 6 product label, `StockLabelDialog`), Products (or Pair
 * to SKU for a temporary SKU, `SkuPairDialog`) and the rest. Both forms open in
 * the verb's centered dialog, so the record never moves. A zero-stock
 * placeholder can be deleted from the same panel. Upload / Send to phone live
 * on the item's photo tile (`StockPhotoTile`).
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Package, Printer, Trash2 } from '@/components/Icons';
import { buildRecordTaskVerb } from '@/components/tasks/RecordTaskActions';
import { SkuPairDialog } from '@/components/inventory/sku-exceptions/SkuPairDialog';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { toast } from '@/lib/toast';
import { stockLocationFace } from './stock-record';
import { StockLabelDialog } from './StockLabelDialog';
import { DELETE_HOTKEY } from '@/lib/keyboard/key-registry';

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
  const face = stockLocationFace(record);
  const sku = record.sku;

  const verbs = useMemo((): RecordActionVerb[] => {
    const go = (href: string) => () => router.push(href);
    const printLabel: RecordActionVerb = {
      id: 'print-label',
      label: 'Print label',
      icon: <Printer className={GLYPH} />,
      hotkey: 'l',
      disabled: !sku,
      disabledReason: 'This record has no SKU to print',
      dialog: (done) => <StockLabelDialog record={record} done={done} />,
    };
    const products: RecordActionVerb = {
      id: 'products',
      label: 'Products',
      icon: <Package className={GLYPH} />,
      hotkey: 'o',
      tone: 'blue',
      disabled: !sku,
      run: go(`/products/sku/${encodeURIComponent(sku)}`),
    };
    const pair: RecordActionVerb = {
      id: 'pair',
      label: 'Pair to SKU',
      icon: <Link2 className={GLYPH} />,
      hotkey: 'z',
      tone: 'yellow',
      disabled: provisional == null,
      disabledReason: 'Loading the temporary SKU',
      dialog: provisional ? (done) => <SkuPairDialog item={provisional} onPaired={onPaired} done={done} /> : undefined,
    };
    const primary = temporary ? [printLabel, products, pair] : [printLabel, products];
    const holdsStock = record.qty > 0;
    const remove: RecordActionVerb = {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className={GLYPH} />,
      tone: 'danger',
      hotkey: DELETE_HOTKEY,
      disabled: holdsStock,
      disabledReason: 'It still holds stock — pair it to a real SKU instead of deleting it.',
      confirmDetail: `${sku} leaves every location. This cannot be undone.`,
      run: async () => {
        const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(sku)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!res.ok || body?.success === false) {
          toast.error(body?.error || 'Could not delete the placeholder.');
          return;
        }
        toast.success(`Deleted ${sku}`);
        onPaired();
      },
    };
    const overflow: RecordActionVerb[] = [
      buildRecordTaskVerb({ entityType: null, entityId: null, label: `${face ?? 'No location'} · ${sku || 'No SKU'}` }),
      ...(temporary ? [remove] : []),
    ];
    return [...primary, ...overflow];
  }, [face, onPaired, provisional, record, router, sku, temporary]);

  return (
    <RecordGroup title="Actions" testId="stock-record-actions-panel">
      <RecordActionStrip face="panel" verbs={verbs} label={`Stock ${sku || face || 'record'} actions`} testId="stock-record-actions" />
    </RecordGroup>
  );
}
