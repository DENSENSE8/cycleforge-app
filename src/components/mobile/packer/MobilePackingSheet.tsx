'use client';

import Link from 'next/link';
import { Camera } from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { OrderPackChecklist } from '@/components/packing/OrderPackChecklist';
import { useOrderPackChecklist } from '@/hooks/useOrderPackChecklist';
import { usePackingPolicy } from '@/hooks/usePackingPolicy';
import {
  OrderIdChip,
  SkuScanRefChip,
  TrackingChip,
  SerialChip,
  getLast8,
} from '@/components/ui/CopyChip';
import {
  joinStackedIdentityKeys,
  StackedRowIdentity,
} from '@/components/ui/StackedRowIdentity';
import type { PackerLogRow } from '@/components/mobile/packer/types';

interface MobilePackingSheetProps {
  row: PackerLogRow | null;
  open: boolean;
  onClose: () => void;
}

function getSourceDotBg(row: PackerLogRow) {
  const trackingType = String(row.tracking_type || '').toUpperCase();
  if (trackingType === 'FNSKU' || row.fnsku) return 'bg-purple-500';
  if (trackingType === 'SKU') return 'bg-yellow-500';
  if (trackingType === 'ORDERS') return 'bg-blue-500';
  return 'bg-emerald-500';
}

/**
 * Phone-tuned sheet for a single packer log entry. Header mirrors the mobile
 * receiving carton sheet: title + qty/condition on the left, copy chips on
 * the right. Shows existing pack photos via PhotoGallery, with a CTA that
 * hands off to /m/p/{packerLogId}/photos for fresh captures.
 */
export function MobilePackingSheet({ row, open, onClose }: MobilePackingSheetProps) {
  if (!row) return null;

  const packerLogId = row.packer_log_id;
  const productTitle = row.product_title || row.item_number || row.sku || 'Unnamed pack line';
  const quantity = parseInt(String(row.quantity || '1'), 10) || 1;
  const orderId = (row.order_id || '').trim();
  const skuValue = (row.sku || '').trim();
  const trackingValue = (row.shipping_tracking_number || row.scan_ref || '').trim();
  const serialValue = (row.serial_number || '').trim();
  const photos = Array.isArray(row.packer_photos_url) ? row.packer_photos_url : [];
  const orderRowId = row.order_row_id ?? null;

  const { data: packingPolicy } = usePackingPolicy();
  const { data: packChecklist, isLoading: checklistLoading } = useOrderPackChecklist({
    orderRowId,
    sku: skuValue || null,
    condition: row.condition,
    productTitle: productTitle,
    enabled: open && (orderRowId != null || Boolean(skuValue)),
  });

  // Carry the real order number so packer photos file under it in the library.
  // Guided Review starts on the slip step (plan §2b).
  const photosHref = packerLogId
    ? `/m/p/${packerLogId}/photos?${new URLSearchParams({
        ...(orderId ? { orderId } : {}),
        step: 'slip',
      }).toString()}`
    : null;

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="32rem">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getSourceDotBg(row)}`} />
          <StackedRowIdentity
            className="min-w-0 flex-1"
            title={
              <div className="line-clamp-2 text-sm font-semibold text-text-default">
                {productTitle}
              </div>
            }
            keys={joinStackedIdentityKeys([
              <span
                key="qty"
                className={`shrink-0 text-role-caption font-semibold uppercase tracking-widest ${
                  quantity > 1 ? 'text-text-warning' : 'text-text-muted'
                }`}
              >
                {quantity}
              </span>,
              <OrderIdChip key="order" value={orderId} display={getLast8(orderId)} dense />,
              <SkuScanRefChip key="sku" value={skuValue} display={getLast8(skuValue)} dense />,
              <TrackingChip
                key="tracking"
                value={trackingValue}
                display={getLast8(trackingValue)}
                dense
              />,
              <SerialChip key="serial" value={serialValue} />,
            ])}
          />
        </div>

        <OrderPackChecklist
          lines={packChecklist?.lines ?? []}
          enforcement={packingPolicy?.enforcement ?? packChecklist?.enforcement ?? 'advisory'}
          resetKey={orderRowId ? `row-${orderRowId}` : skuValue}
          isLoading={checklistLoading}
          variant="mobile"
        />

        {photos.length > 0 ? (
          <div className="rounded-none border border-border-hairline bg-surface-canvas/60 p-3">
            <PhotoGallery photos={photos} orderId={orderId} compact launcherTitle={`Photos ${photos.length}`} />
          </div>
        ) : (
          <p className="rounded-none bg-amber-50 px-4 py-3 text-center text-role-caption font-semibold text-amber-700">
            No pack photos yet — tap below to capture.
          </p>
        )}

        {photosHref ? (
          <Link
            href={photosHref}
            prefetch={false}
            onClick={onClose}
            aria-label="Take photos"
            className="flex h-14 w-full items-center justify-center rounded-none bg-blue-600 text-white shadow-sm transition-colors active:bg-blue-700"
          >
            <Camera className="h-6 w-6" />
          </Link>
        ) : (
          <p className="rounded-none bg-rose-50 px-4 py-3 text-center text-role-caption font-semibold text-rose-700">
            Missing packer log id — cannot attach photos.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
