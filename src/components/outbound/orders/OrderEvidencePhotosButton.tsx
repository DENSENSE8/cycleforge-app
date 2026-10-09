'use client';

/**
 * The order's EVIDENCE photos door, top-right of the record above Shipping
 * (owner 2026-09-29). Two photo identities, never mixed:
 * - the PRODUCT photo is the catalog image the rows and the Items card paint;
 * - the EVIDENCE photos are what the floor shot on this order's units —
 *   arrival, unbox, testing, packing (+ the legacy packer blob) — and this
 *   button opens them in the shared fullscreen viewer (`PhotoViewerPortal`,
 *   Unbox's viewer).
 * Always present, so the door is learnt: with none yet it reads
 * "No photos yet" and stays disabled. Blue once the floor has shot evidence
 * on the order, and the record's `P` (`ORDER_RECORD_PHOTOS_KEY`) opens it —
 * the one photo door on the record (operator 2026-10-09: no second header chip).
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import { buildOrderGalleryPhotos } from '@/lib/photos/order-gallery-photos';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { Button } from '@/design-system/primitives/Button';
import { toast } from '@/lib/toast';
import { useOrderPhotosRequest } from './order-photos-request';
import { ORDER_RECORD_PHOTOS_KEY } from './record-keys/order-key-table';

export const OrderEvidencePhotosButton = memo(function OrderEvidencePhotosButton({
  orderId,
  packerPhotos,
}: {
  orderId: number;
  /** `orders.packer_photos_url` — the legacy packer blob, folded in after the unit evidence. */
  packerPhotos: unknown;
}) {
  const { data, isLoading } = useQuery(orderTimelineQuery(orderId));
  const photos = useMemo(
    () => buildOrderGalleryPhotos(data?.unitPhotos ?? [], packerPhotos),
    [data?.unitPhotos, packerPhotos],
  );
  const gallery = usePhotoGallery({ photos });
  const count = photos.length;
  useOrderPhotosRequest(orderId, () => {
    if (count > 0) gallery.openViewer(0);
    else if (!isLoading) toast.info('No photos on this order yet');
  });
  const label = isLoading
    ? 'Loading photos'
    : count > 0
      ? `View ${count} order photo${count === 1 ? '' : 's'} full screen`
      : 'No order photos yet';

  return (
    <>
      <HoverTooltip label={label} shortcut={ORDER_RECORD_PHOTOS_KEY.toUpperCase()} asChild placement="above">
        <Button
          type="button"
          variant={count > 0 ? 'primarySoft' : 'secondary'}
          size="sm"
          icon={<Camera />}
          disabled={count === 0}
          ariaLabel={label}
          aria-keyshortcuts={ORDER_RECORD_PHOTOS_KEY.toUpperCase()}
          onClick={() => gallery.openViewer(0)}
          className="w-full justify-center tabular-nums"
          data-testid="order-record-photos"
          data-photo-count={isLoading ? undefined : count}
        >
          {isLoading ? 'Photos' : count > 0 ? `Photos · ${count}` : 'No photos yet'}
        </Button>
      </HoverTooltip>
      {count > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </>
  );
});
