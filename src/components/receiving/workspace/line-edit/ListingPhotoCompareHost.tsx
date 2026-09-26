'use client';

/** Unbox Displays → Photos → Compare — listing gallery vs carton/item evidence. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from '@/components/Icons';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { useListingGallery } from '@/hooks/useListingGallery';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import {
  photoIntentFromStage,
  RECEIVING_PHOTO_LIST_INTENT_CARTON,
} from '@/lib/receiving/photo-intent';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { listingLinksForReceivingRow } from '@/lib/receiving/listing-links';

const ITEM_LIST_INTENT = photoIntentFromStage('unbox_item');

interface PhotoRow {
  id: number;
  photoUrl: string;
  photoAspect?: string | null;
}

function ThumbGrid({
  urls,
  empty,
}: {
  urls: Array<{ id: string | number; src: string; alt?: string }>;
  empty: string;
}) {
  if (urls.length === 0) {
    return <p className="text-role-caption text-text-soft">{empty}</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {urls.map((u) => (
        <li key={u.id}>
          <PhotoThumb
            src={u.src}
            alt={u.alt ?? ''}
            ratio="square"
            className="h-full w-full rounded-md"
          />
        </li>
      ))}
    </ul>
  );
}

function useCartonPhotos(receivingId: number) {
  return useQuery<{ photos: PhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), RECEIVING_PHOTO_LIST_INTENT_CARTON, 'compare'],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: RECEIVING_PHOTO_LIST_INTENT_CARTON,
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: receivingId > 0,
    staleTime: 10_000,
  });
}

function useItemPhotos(receivingId: number, lineId: number) {
  return useQuery<{ photos: PhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), ITEM_LIST_INTENT, lineId, 'compare'],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: ITEM_LIST_INTENT,
        receivingLineId: String(lineId),
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: receivingId > 0 && lineId > 0,
    staleTime: 10_000,
  });
}

export function ListingPhotoCompareHost({ row }: { row: ReceivingLineRow }) {
  const receivingId = row.receiving_id ?? 0;
  const lineId = row.id ?? 0;
  // Resolver, not the bare column — see TestingListingVerifyHost.
  const listingHref = listingLinksForReceivingRow(row)[0]?.href ?? '';
  const skuId = row.sku_catalog_id ?? null;

  const listingTarget = useMemo(
    () => (skuId != null && skuId > 0 ? ({ kind: 'sku' as const, id: skuId }) : null),
    [skuId],
  );
  const listingGallery = useListingGallery(listingTarget);
  const carton = useCartonPhotos(receivingId);
  const item = useItemPhotos(receivingId, lineId);

  const cartonUrls = useMemo(
    () =>
      (carton.data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => ({ id: `c-${p.id}`, src: p.photoUrl, alt: p.photoAspect ?? 'Carton' })),
    [carton.data],
  );
  const itemUrls = useMemo(
    () =>
      (item.data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => ({ id: `i-${p.id}`, src: p.photoUrl, alt: p.photoAspect ?? 'Item' })),
    [item.data],
  );
  const listingUrls = useMemo(
    () =>
      listingGallery.items.map((it) => ({
        id: `l-${it.id}`,
        src: it.thumbUrl || it.displayUrl,
        alt: 'Listing',
      })),
    [listingGallery.items],
  );

  const evidenceUrls = [...itemUrls, ...cartonUrls];

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-3 py-2"
      data-unbox-listing-compare
    >
      <p className="text-role-caption text-text-soft">
        Compare bench evidence to the listing. Capture stays in the dock.
      </p>

      <section className="space-y-1.5" data-unbox-listing-compare-listing>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Listing</p>
          {listingHref ? (
            <Button
              variant="ghost"
              size="sm"
              // Station chrome is square.
              className={cornerClass('flush')}
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => window.open(listingHref, '_blank', 'noopener,noreferrer')}
            >
              Open listing
            </Button>
          ) : null}
        </div>
        {listingTarget ? (
          listingGallery.isLoading ? (
            <p className="text-role-caption text-text-soft">Loading listing photos…</p>
          ) : (
            <ThumbGrid urls={listingUrls} empty="No listing gallery photos on this SKU yet." />
          )
        ) : (
          <p className="text-role-caption text-text-soft">
            {listingHref
              ? 'Open the listing to compare — no SKU gallery linked on this line.'
              : 'No listing URL on this carton yet — add one under Listings.'}
          </p>
        )}
      </section>

      <section className="space-y-1.5" data-unbox-listing-compare-evidence>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Bench evidence</p>
        <ThumbGrid
          urls={evidenceUrls}
          empty="No carton or item photos yet — shoot from the dock."
        />
      </section>
    </div>
  );
}
