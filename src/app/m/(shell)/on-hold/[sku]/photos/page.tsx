'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  MobilePackerSpamCamera,
  type CapturedShot,
  type PriorPhoto,
} from '@/components/mobile/station/MobilePackerSpamCamera';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { DetailAck } from '@/components/mobile/detail/DetailParts';
import { SkuExceptionScreen } from '@/components/mobile/onhold/SkuExceptionScreen';
import { useSkuExceptionPhotoUploads } from '@/components/mobile/onhold/useSkuExceptionPhotoUploads';
import { Camera } from '@/components/Icons';
import { DetailDock } from '@/design-system/components/DetailDock';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { mobileSkuExceptionHref } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/**
 * `/m/on-hold/[sku]/photos` — what the unknown product looks like, so whoever
 * pairs it can recognise it. Grid + full-screen viewer (delete from the
 * viewer); **Take photo** uploads through `/api/photos/upload` as `SKU_STOCK`.
 * `?capture=1` (the hub dock's Take photo) opens the camera on arrival.
 */
function SkuExceptionPhotosBody({ item }: { item: ProvisionalSkuDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { has, isLoaded } = useAuth();
  const canUpload = !isLoaded || has('sku_stock.adjust');
  const uploads = useSkuExceptionPhotoUploads(item.stockId, () => void invalidateSkuExceptions(queryClient));

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Arrive-and-capture: open once, then drop the flag so Back/refresh does not reopen it.
  useEffect(() => {
    if (searchParams?.get('capture') === '1') {
      if (canUpload) setCapturing(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname, canUpload]);

  const slides = useMemo<SwipePhotoSlide[]>(
    () => item.photos.map((p) => ({ id: String(p.id), previewUrl: p.url, deletable: canUpload })),
    [item.photos, canUpload],
  );
  const priorPhotos = useMemo<PriorPhoto[]>(
    () => item.photos.map((p) => ({ id: String(p.id), previewUrl: p.thumbUrl, photoId: p.id })),
    [item.photos],
  );

  const onCaptured = (shots: CapturedShot[]) => {
    setCapturing(false);
    uploads.clearCommitted();
    if (shots.length > 0) uploads.upload(shots);
  };

  const deletePhoto = async (photoId: number) => {
    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error || 'Could not delete the photo');
      return;
    }
    await invalidateSkuExceptions(queryClient);
  };

  const newest = item.photos.length > 0 ? item.photos[item.photos.length - 1] : null;
  const cell = 'min-h-mode-hit-cta w-full px-2';

  return (
    <>
      <div className="flex-1 divide-y divide-mode-rule">
        {uploads.uploading > 0 ? (
          <p role="status" className="bg-mode-panel px-mode-page py-3 text-role-caption font-semibold text-mode-ink">
            Uploading {plural(uploads.uploading, 'photo')}…
          </p>
        ) : null}

        {uploads.failed.length > 0 ? (
          <div role="alert" className="space-y-2 bg-rose-50 px-mode-page py-3 text-role-caption text-rose-700">
            <p className="font-semibold">
              {plural(uploads.failed.length, 'photo')} didn&apos;t upload — {uploads.failed[0].error}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" radius="flush" className={cell} onClick={uploads.discardFailed}>
                Discard
              </Button>
              <Button variant="primary" size="lg" radius="flush" className={cell} onClick={uploads.retryFailed}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {uploads.lastCommitted > 0 && uploads.uploading === 0 ? (
          <DetailAck onDismiss={uploads.clearCommitted}>
            Saved {plural(uploads.lastCommitted, 'photo')} to {item.sku}
          </DetailAck>
        ) : null}

        {item.photos.length === 0 ? (
          <p className="px-mode-page py-10 text-center text-role-caption text-mode-muted">
            No photos yet. A photo is what lets a teammate recognise the product to pair it.
          </p>
        ) : (
          <div className="space-y-3 bg-mode-panel px-mode-page py-3">
            <p className="text-role-caption text-mode-muted">
              {plural(item.photos.length, 'photo')}
              {newest ? ` · newest ${formatMonthDayTimePST(newest.createdAt)}` : ''}
            </p>
            <ul className="grid grid-cols-3 gap-1.5" aria-label="SKU exception photos">
              {item.photos.map((photo, index) => (
                <li key={photo.id}>
                  {/* ds-raw-button: square photo tile, not a text/action button */}
                  <button
                    type="button"
                    onClick={() => setViewerIndex(index)}
                    aria-label={`Open photo ${index + 1} of ${item.photos.length}`}
                    className="relative block aspect-square w-full overflow-hidden rounded-mode border border-mode-edge bg-mode-panel"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated photo content route */}
                    <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!canUpload ? (
          <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
            Your role cannot add photos to a SKU exception (needs Adjust stock).
          </p>
        ) : null}
      </div>

      <DetailDock
        label="Photo actions"
        verbs={[{ id: 'photo', label: 'Take photo', icon: <Camera />, primary: true, disabled: !canUpload }]}
        onVerb={() => setCapturing(true)}
      />

      <MobileSwipePhotoViewer
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        slides={slides}
        onClose={() => setViewerIndex(null)}
        onDelete={(slide) => deletePhoto(Number(slide.id))}
      />

      {capturing ? (
        <MobilePackerSpamCamera
          onDone={onCaptured}
          onCancel={() => setCapturing(false)}
          maxPhotos={10}
          priorPhotos={priorPhotos}
          header={
            <div className="min-w-0">
              <p className="text-role-micro uppercase tracking-[0.22em] text-white/60">SKU exception photos</p>
              <p className="truncate text-sm font-semibold text-white">
                {item.sku} · {item.productTitle}
              </p>
            </div>
          }
        />
      ) : null}
    </>
  );
}

function SkuExceptionPhotosInner() {
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(params?.sku ?? '');
  return (
    <SkuExceptionScreen
      sku={sku}
      subtitle="Photos"
      backHref={mobileSkuExceptionHref(sku)}
      meta={(item) => item.productTitle}
    >
      {(item) => <SkuExceptionPhotosBody item={item} />}
    </SkuExceptionScreen>
  );
}

export default function SkuExceptionPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <SkuExceptionPhotosInner />
    </Suspense>
  );
}
