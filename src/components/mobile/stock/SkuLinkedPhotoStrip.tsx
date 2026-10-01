'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';

type LinkedPhoto = {
  id: number;
  url: string;
};

type SkuPhotoResponse = {
  photos?: LinkedPhoto[];
};

/** Existing SKU_STOCK/SKU photos, loaded only when a mobile detail is opened. */
export function SkuLinkedPhotoStrip({ sku }: { sku: string }) {
  const { data, isLoading } = useQuery<SkuPhotoResponse>({
    queryKey: ['mobile-sku-linked-photos', sku],
    queryFn: async () => {
      const response = await fetch(`/api/sku-stock/${encodeURIComponent(sku)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not load linked photos');
      return response.json() as Promise<SkuPhotoResponse>;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center" aria-label="Loading linked photos">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  const photos = data?.photos ?? [];
  if (photos.length === 0) return null;

  return (
    <section aria-label={`${photos.length} linked photo${photos.length === 1 ? '' : 's'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-text-default">Linked photos</p>
        <span className="text-[11px] font-semibold tabular-nums text-text-muted">{photos.length}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {photos.map((photo, index) => (
          <a
            key={photo.id}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open linked photo ${index + 1}`}
            className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-border-soft bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated photo endpoint */}
            <img
              src={`${photo.url}?variant=thumb`}
              alt={`Linked photo ${index + 1}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </a>
        ))}
      </div>
    </section>
  );
}
