'use client';

/**
 * The stock record's Actions panel (under Movement, operator 2026-10-08):
 * Print label (the 4 × 6 product label, `StockLabelPopover`, hung under the
 * strip), Products (or Pair to SKU for a temporary SKU) and the rest. Pair
 * opens the `SkuPairSheet` over the record, so the record never moves. A
 * zero-stock placeholder can be deleted from the same panel. Upload / Send to
 * phone live on the item's photo tile (`StockPhotoTile`).
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Package, Printer, Trash2 } from '@/components/Icons';
import { buildRecordTaskVerb } from '@/components/tasks/RecordTaskActions';
import { requestConfirm } from '@/design-system/components/confirm';
import { SkuPairSheet } from '@/components/inventory/sku-exceptions/SkuPairSheet';
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
import { StockLabelPopover } from './StockLabelPopover';
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
  const [pairOpen, setPairOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
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
      run: () => setLabelOpen(true),
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
      run: () => setPairOpen(true),
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
      run: async () => {
        const confirmed = await requestConfirm({
          title: 'Delete placeholder',
          description: `Delete ${sku}? It leaves every location. This cannot be undone.`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;
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
  }, [face, onPaired, provisional, record.qty, router, sku, temporary]);

  return (
    <RecordGroup title="Actions" testId="stock-record-actions-panel">
      <div ref={stripRef} className="flex min-w-0 flex-col gap-2">
        <RecordActionStrip face="panel" verbs={verbs} label={`Stock ${sku || face || 'record'} actions`} testId="stock-record-actions" />
        {labelOpen ? <StockLabelPopover record={record} anchorRef={stripRef} onClose={() => setLabelOpen(false)} /> : null}
        {temporary ? (
          <SkuPairSheet open={pairOpen} onClose={() => setPairOpen(false)} item={provisional} onPaired={onPaired} />
        ) : null}
      </div>
    </RecordGroup>
  );
}
