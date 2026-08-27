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
 * **One shape per query key**, and since 2026-08-21 that is enforced by sharing
 * the fetcher, not by asking each consumer to remember. The rule above this
 * line was already written down while the code below it did the opposite: it
 * parsed the payload down to `{ unitPhotos }` under the key
 * `OrderTimelineSection` and `OrderReturnsCard` also read, and on `/search` it
 * mounts FIRST (the Displays index row needs the photo count), so the Activity
 * trail and the Returns card were reading a cache entry with their fields
 * missing. Both rendered blank, silently.
 *
 * It now spreads {@link orderTimelineQuery} and narrows with `select` — which
 * is per-observer and cannot reshape what anyone else reads.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import { buildOrderGalleryPhotos } from '@/lib/photos/order-gallery-photos';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import type { ShippedOrder } from '@/types/orders';

export function useSearchOrderPhotos(order: ShippedOrder | null): {
  photos: PhotoGalleryInput[];
  loading: boolean;
  settled: boolean;
} {
  const numericId = Number(order?.id ?? 0);
  const enabled = Number.isFinite(numericId) && numericId > 0;

  const query = useQuery({
    ...orderTimelineQuery(numericId),
    // Per-observer narrowing. The cache still holds the full payload.
    select: (data) => data.unitPhotos,
  });

  const photos = useMemo(
    () => (order ? buildOrderGalleryPhotos(query.data ?? [], order.packer_photos_url) : []),
    [order, query.data],
  );

  return {
    photos,
    loading: enabled && query.isLoading,
    settled: enabled && !query.isLoading,
  };
}
