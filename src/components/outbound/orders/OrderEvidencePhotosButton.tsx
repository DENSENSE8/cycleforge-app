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
 * "No photos yet" and stays disabled.
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera } from '@/components/Icons';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import { buildOrderGalleryPhotos } from '@/lib/photos/order-gallery-photos';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { Button } from '@/design-system/primitives/Button';

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

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<Camera />}
        disabled={count === 0}
        ariaLabel={count > 0 ? `View ${count} order photo${count === 1 ? '' : 's'} full screen` : 'No order photos yet'}
        onClick={() => gallery.openViewer(0)}
        className="w-full justify-center"
        data-testid="order-record-photos"
      >
        {isLoading ? 'Photos' : count > 0 ? `Photos · ${count}` : 'No photos yet'}
      </Button>
      {count > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </>
  );
});
