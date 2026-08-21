'use client';

/**
 * The `/search` order PHOTO spine — evidence for the Displays `photos` leaf.
 *
 * It used to serve two consumers and be named for the fetch (`…-timeline`): the
 * centre's audit rows and this. The audit half is gone (2026-08-21) — the
 * `timeline` leaf composes `OrderTimelineSection`, the order-record SoT, which
 * merges six spines and owns its own lens / grouping chrome. What is left is
 * the one thing with no SoT anywhere: mapping the payload's `unitPhotos` and
 * the legacy `packer_photos_url` blob onto gallery inputs.
 *
 * **One shape per query key.** The key is the plain `['order-timeline', id]`
 * that `OrderTimelineSection` and `OrderReturnsCard` already use, so all three
 * share ONE fetch of the route. It therefore parses the FULL payload and
 * selects only what it needs — a narrower parse under the same key would make
 * whichever consumer mounted first decide what the other two see.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import { buildOrderGalleryPhotos } from '@/lib/photos/order-gallery-photos';
import type { UnitTimelinePhotoRow } from '@/lib/timeline';
import type { ShippedOrder } from '@/types/orders';

export function useSearchOrderPhotos(order: ShippedOrder | null): {
  photos: PhotoGalleryInput[];
  loading: boolean;
  settled: boolean;
} {
  const numericId = Number(order?.id ?? 0);
  const enabled = Number.isFinite(numericId) && numericId > 0;

  const query = useQuery({
    queryKey: ['order-timeline', numericId],
    queryFn: async (): Promise<{ unitPhotos: UnitTimelinePhotoRow[] }> => {
      const res = await fetch(`/api/orders/${numericId}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch order timeline');
      const json = await res.json();
      return { unitPhotos: (json.unitPhotos ?? []) as UnitTimelinePhotoRow[] };
    },
    enabled,
    staleTime: 30_000,
  });

  const photos = useMemo(
    () =>
      order ? buildOrderGalleryPhotos(query.data?.unitPhotos ?? [], order.packer_photos_url) : [],
    [order, query.data],
  );

  return {
    photos,
    loading: enabled && query.isLoading,
    settled: enabled && !query.isLoading,
  };
}
