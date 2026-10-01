'use client';

/**
 * The stock record's verbs, one strip: three icon+text buttons and a vertical
 * ⋮ for the rest. A temporary SKU promotes Pair to Zoho into that row.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Link2, Package, PackageSearch, Send, Smartphone, Upload } from '@/components/Icons';
import { RecordTaskForm } from '@/components/tasks/RecordTaskActions';
import { SkuExceptionPairSection } from '@/components/inventory/sku-exceptions/SkuExceptionPairSection';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { stockLocationFace } from './stock-record';
import { useSkuStockPhotoUpload } from './useSkuStockPhotoUpload';
import { useSkuStockSendToPhone } from './useSkuStockSendToPhone';

const GLYPH = 'size-3.5';

export function StockRecordActions({
  record,
  onChanged,
  onPaired,
}: {
  record: LocationStockTableRow;
  onChanged: () => void;
  onPaired: () => void;
}) {
  const router = useRouter();
  const provisional = useProvisionalSku(record.is_provisional ? record.sku : null).data ?? null;
  const upload = useSkuStockPhotoUpload(record.stock_id, onChanged);
  const phone = useSkuStockSendToPhone({ stockId: record.stock_id, sku: record.sku, onChanged });
  const [pairOpen, setPairOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const face = stockLocationFace(record);
  const sku = record.sku;
  const temporary = record.is_provisional || sku.startsWith('TMP-');

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
      label: 'Pair to Zoho SKU',
      icon: <Link2 className={GLYPH} />,
      hotkey: 'z',
      tone: 'warning',
      disabled: provisional == null,
      disabledReason: 'Loading the placeholder',
      run: () => {
        setTaskOpen(false);
        setPairOpen(true);
      },
    };
    const primary = temporary ? [products, inventory, pair] : [products, inventory, bin];
    const overflow: RecordActionVerb[] = [
      ...(temporary ? [bin] : []),
      {
        id: 'upload',
        label: upload.progress ?? 'Upload photo',
        icon: <Upload className={GLYPH} />,
        hotkey: 'u',
        disabled: record.stock_id == null,
        disabledReason: 'No stock row to attach a photo to',
        run: () => upload.pick(),
      },
      {
        id: 'phone',
        label: phone.busy ? phone.label : 'Send to phone',
        icon: <Smartphone className={GLYPH} />,
        hotkey: 'p',
        disabled: !phone.available || phone.busy,
        disabledReason: phone.available ? undefined : 'No phone paired for this station',
        run: () => phone.send(),
      },
      {
        id: 'staff',
        label: 'Send to staff',
        icon: <Send className={GLYPH} />,
        hotkey: 't',
        run: () => {
          setPairOpen(false);
          setTaskOpen(true);
        },
      },
    ];
    return [...primary, ...overflow];
  }, [phone, provisional, record.location_barcode, record.stock_id, router, sku, temporary, upload]);

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      {upload.input}
      <RecordActionStrip face="inline" verbs={verbs} label={`Stock ${sku || face || 'record'} actions`} testId="stock-record-actions" />
      {pairOpen && provisional ? (
        <SkuExceptionPairSection fieldId="stock-record-pair" item={provisional} onPaired={onPaired} />
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
