'use client';

/**
 * The order record's photo peek: every unit photo the order touched (arrival,
 * unbox, testing, packing), newest first, through the shared
 * {@link PhotoPeekFan} — hover fans them, click opens the fan, a card opens
 * `PhotoViewerPortal`. Reads the order-timeline payload the record's timeline
 * already fetches (one key), so it costs no second request.
 */

import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhotoPeekFan, type PeekCard } from '@/components/receiving/workspace/line-edit/PhotoPeekFan';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';

export const OrderPhotoPeek = memo(function OrderPhotoPeek({ orderId }: { orderId: number }) {
  const { data } = useQuery(orderTimelineQuery(orderId));
  const photos = data?.unitPhotos;

  const cards = useMemo<PeekCard[]>(
    () =>
      [...(photos ?? [])]
        .sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))
        .map((p) => ({
          id: String(p.photoId),
          imgUrl: p.thumbUrl,
          fullUrl: p.fullUrl,
          alt: `${p.source.replace('_', ' ')} photo${p.serial ? ` · ${p.serial}` : ''}`,
        })),
    [photos],
  );

  return <PhotoPeekFan cards={cards} placement="inline" />;
});
