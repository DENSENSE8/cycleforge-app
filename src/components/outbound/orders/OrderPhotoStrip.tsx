'use client';

/**
 * The order's photos INLINE in the record (owner 2026-09-27): a thumbnail
 * strip of one evidence stage (packing under Packed, testing under QC,
 * arrival + unbox under the item), each tile opening the shared fullscreen
 * viewer. Same payload as {@link OrderPhotoPeek} (the order-timeline query, one
 * key, no second request) and the same gallery SoT (`usePhotoGallery` +
 * `PhotoLauncher` thumbnails + `PhotoViewerPortal`) — never a bespoke lightbox.
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import type { UnitTimelinePhotoRowSource } from '@/lib/timeline/unit-photos-events';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoLauncher } from '@/components/shipped/photo-gallery/PhotoLauncher';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';

export const OrderPhotoStrip = memo(function OrderPhotoStrip({
  orderId,
  sources,
  sku,
}: {
  orderId: number;
  /** The evidence stages this strip shows. */
  sources: readonly UnitTimelinePhotoRowSource[];
  /** Several lines: only this line's unit photos. */
  sku?: string | null;
}) {
  const { data } = useQuery(orderTimelineQuery(orderId));
  const photos = useMemo<PhotoGalleryInput[]>(
    () =>
      [...(data?.unitPhotos ?? [])]
        .filter((p) => sources.includes(p.source) && (!sku || !p.sku || p.sku === sku))
        .sort((a, b) => (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0))
        .map((p) => ({ id: p.photoId, url: p.fullUrl, thumbUrl: p.thumbUrl, uploadedAt: p.at ?? undefined })),
    [data?.unitPhotos, sources, sku],
  );

  const gallery = usePhotoGallery({ photos, launcherLayout: 'thumbnails' });
  if (photos.length === 0) return null;
  return (
    <div data-testid="order-photo-strip" data-photo-sources={sources.join(' ')}>
      <PhotoLauncher g={gallery} />
      <PhotoViewerPortal g={gallery} />
    </div>
  );
});
