'use client';

import { Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  MobileNativePhotoCapture,
  type CapturedShot,
} from '@/components/mobile/photos/MobileNativePhotoCapture';
import { uploadSkuStockShots } from '@/lib/photos/sku-stock-photo-upload';

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
      void uploadSkuStockShots(stockId, shots);
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
