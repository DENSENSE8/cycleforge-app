'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Printer } from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MobileOrderPaperworkSheet } from '@/components/mobile/orders/MobileOrderPaperworkSheet';
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
import { Button } from '@/design-system/primitives';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';

interface MobilePackingSheetProps {
  row: PackerLogRow | null;
  open: boolean;
  onClose: () => void;
}

function getSourceDotBg(row: PackerLogRow) {
  const trackingType = String(row.tracking_type || '').toUpperCase();
  if (trackingType === 'FNSKU' || row.fnsku) return 'bg-fill-info';
  if (trackingType === 'SKU') return 'bg-fill-warning';
  if (trackingType === 'ORDERS') return 'bg-fill-info';
  return 'bg-fill-success';
}

/** Phone-tuned sheet for a single packer log entry. */
export function MobilePackingSheet({ row, open, onClose }: MobilePackingSheetProps) {
  const router = useRouter();
  const [paperworkOpen, setPaperworkOpen] = useState(false);
  const productTitle = row?.product_title || row?.item_number || row?.sku || 'Unnamed pack line';
  const skuValue = (row?.sku || '').trim();
  const orderRowId = row?.order_row_id ?? null;

  const { data: packingPolicy } = usePackingPolicy();
  const { data: packChecklist, isLoading: checklistLoading } = useOrderPackChecklist({
    orderRowId,
    sku: skuValue || null,
    condition: row?.condition,
    productTitle: productTitle,
    enabled: open && (orderRowId != null || Boolean(skuValue)),
  });
  const scopedPhotos = useScopedPackerPhotos(row?.packer_log_id ?? 0, { enabled: open && Boolean(row?.packer_log_id) });

  // Every hook runs above this guard: the controlled sheet mounts with no row.
  if (!row) return null;

  const packerLogId = row.packer_log_id;
  const quantity = parseInt(String(row.quantity || '1'), 10) || 1;
  const orderId = (row.order_id || '').trim();
  const trackingValue = (row.shipping_tracking_number || row.scan_ref || '').trim();
  const serialValue = (row.serial_number || '').trim();
  const photos = scopedPhotos.query.data?.photos.map((photo) => ({ id: photo.id, url: photo.photoUrl })) ?? [];

  // Extra captures reuse the same packer-log scope and retain its order key.
  const photosHref = packerLogId
    ? `/m/p/${packerLogId}/photos?${new URLSearchParams({
        ...(orderId ? { orderId } : {}),
        ...(orderRowId ? { orderRowId: String(orderRowId) } : {}),
        mode: 'spam',
      })}`
    : null;

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="32rem">
      <div data-testid="mobile-packing-sheet" className="flex flex-col gap-4">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-none ${getSourceDotBg(row)}`} />
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
                className={`shrink-0 text-role-caption font-semibold ${
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

        {scopedPhotos.query.isError ? (
          <p role="alert" className="text-role-caption text-text-danger">Could not load packing photos.</p>
        ) : photos.length > 0 ? (
          <div className="border border-border-hairline bg-surface-card p-3">
            <PhotoGallery
              photos={photos}
              orderId={orderId}
              compact
              launcherTitle={`Photos ${photos.length}`}
              onPhotoDeleted={() => void scopedPhotos.query.refetch()}
            />
          </div>
        ) : (
          <p className="bg-surface-warning px-4 py-3 text-center text-role-caption font-semibold text-text-warning">
            {scopedPhotos.query.isPending ? 'Loading packing photos…' : 'No pack photos yet — take photos below.'}
          </p>
        )}
        {orderRowId ? (
          <Button variant="secondary" size="md" icon={<Printer />} onClick={() => setPaperworkOpen(true)}>
            Paperwork + label
          </Button>
        ) : null}
        {photosHref ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            icon={<Camera />}
            radius="flush"
            onClick={() => {
              onClose();
              router.replace(photosHref);
            }}
            className="h-14 w-full"
          >
            Take more photos
          </Button>
        ) : (
          <p className="bg-surface-danger px-4 py-3 text-center text-role-caption font-semibold text-text-danger">
            Missing packer log id — cannot attach photos.
          </p>
        )}
      </div>
      {orderRowId ? (
        <MobileOrderPaperworkSheet
          open={paperworkOpen}
          onClose={() => setPaperworkOpen(false)}
          orderId={orderRowId}
          orderRef={orderId}
          pack={{ packerLogId }}
        />
      ) : null}
    </BottomSheet>
  );
}
