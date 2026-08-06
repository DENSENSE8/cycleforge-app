'use client';

/**
 * SearchOrderFeedback — dogfood rebuild for `/search?sel=order:…`.
 *
 * Step 1: photo CTA only (`PhotoGallery` default launcher) — top-right under
 * the global header. Do not re-import desk/durable order shells.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  PhotoGallery,
  type PhotoGalleryInput,
} from '@/components/shipped/PhotoGallery';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';

export function SearchOrderFeedback({ orderId }: { orderId: string | number }) {
  const [photos, setPhotos] = useState<PhotoGalleryInput[] | null>(null);
  const [orderRef, setOrderRef] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    const resolved = await resolveSearchOrder(String(orderId));
    if (resolved.status !== 'ok') {
      setPhotos([]);
      setOrderRef(undefined);
      return;
    }
    const list = (resolved.order.packer_photos_url ?? []) as PhotoGalleryInput[];
    setPhotos(Array.isArray(list) ? list : []);
    setOrderRef(String(resolved.order.order_id || '').trim() || undefined);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas"
      aria-label="Search order feedback"
    >
      {/* Top-right under GlobalHeader — first rebuild atom: packing photo CTA. */}
      <div className="flex shrink-0 justify-end px-4 pt-3">
        <div className="w-72 max-w-full">
          {photos == null ? null : (
            <PhotoGallery
              photos={photos}
              orderId={orderRef}
              launcherTitle="Photos"
              launcherTone="neutral"
            />
          )}
        </div>
      </div>
    </div>
  );
}
