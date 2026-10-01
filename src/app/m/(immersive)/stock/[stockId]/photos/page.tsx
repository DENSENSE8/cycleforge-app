'use client';

import { Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  MobileNativePhotoCapture,
  type CapturedShot,
} from '@/components/mobile/photos/MobileNativePhotoCapture';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';

/**
 * Upload the batch in the background, in shutter order, as `SKU_STOCK`
 * primary links — the same write as the desk record's photo upload. The server
 * announces each one (`sku-stock-photo.changed`), which repaints the desk.
 */
async function uploadStockShots(stockId: number, shots: CapturedShot[]): Promise<void> {
  let failed = 0;
  for (const shot of shots) {
    try {
      await uploadPhotoClient({
        file: shot.blob,
        entityType: 'SKU_STOCK',
        entityId: stockId,
        linkRole: 'primary',
        clientCapturedAtMs: shot.capturedAtMs,
      });
    } catch (err) {
      failed += 1;
      console.warn('stock photo upload failed', err);
    } finally {
      URL.revokeObjectURL(shot.previewUrl);
    }
  }
  const added = shots.length - failed;
  if (failed > 0) {
    toast.error(`${failed} photo${failed === 1 ? '' : 's'} failed to upload`, { position: 'top-center' });
  }
  if (added > 0) {
    toast.success(`Added ${added} photo${added === 1 ? '' : 's'}`, { position: 'top-center' });
  }
}

/** Immersive product-photo capture for one `sku_stock` row — the phone lands here from the desk stock record's "Send to phone". */
function StockPhotosPageInner() {
  const router = useRouter();
  const params = useParams<{ stockId: string }>();
  const searchParams = useSearchParams();
  const stockId = Number(params?.stockId);
  const sku = (searchParams.get('sku') || '').trim();
  const backParam = (searchParams.get('back') || '').trim();
  // Only an in-app phone path — never an arbitrary URL from the query string.
  const returnHref = backParam.startsWith('/m') ? backParam : '/m/scan';
  const validId = Number.isFinite(stockId) && stockId > 0;

  const returnToCaller = useCallback(() => {
    router.replace(returnHref);
  }, [router, returnHref]);

  const handleDone = useCallback(
    (shots: CapturedShot[]) => {
      if (shots.length > 0) {
        toast.message(`Uploading ${shots.length} photo${shots.length === 1 ? '' : 's'}…`, {
          position: 'top-center',
          duration: 5000,
        });
        void uploadStockShots(stockId, shots);
      }
      returnToCaller();
    },
    [returnToCaller, stockId],
  );

  if (!validId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold text-white/70">Invalid stock id</p>
      </div>
    );
  }

  return (
    <MobileNativePhotoCapture
      embedded
      onDone={handleDone}
      onCancel={returnToCaller}
      maxPhotos={10}
      header={
        <div className="min-w-0">
          <p className="text-role-micro text-white/60">Add product photos</p>
          <p className="truncate text-sm font-semibold text-white">{sku || `Stock #${stockId}`}</p>
        </div>
      }
    />
  );
}

export default function StockPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-stage" />}>
      <StockPhotosPageInner />
    </Suspense>
  );
}
