'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobilePackerPhotoStudio } from '@/components/mobile/photos/MobilePackerPhotoStudio';

function PhotoPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const packerLogId = Number(params?.id);
  const orderId = searchParams.get('orderId') || `PL-${packerLogId}`;
  const orderRowId = Number(searchParams.get('orderRowId'));
  const scanClientEventId = searchParams.get('scanEvent')?.trim() || null;
  const mobileScanEventIdRaw = Number(searchParams.get('mse'));
  const mobileScanEventId =
    Number.isSafeInteger(mobileScanEventIdRaw) && mobileScanEventIdRaw > 0
      ? mobileScanEventIdRaw
      : null;
  // Guided Review capture is the default for /m/p/{id}/photos (plan §2b).
  const stepParam = searchParams.get('step');
  const spamMode = searchParams.get('mode') === 'spam';
  const guided = !spamMode;
  const completePacking = searchParams.get('complete') === '1';
  const initialStep = stepParam === 'box' ? 'box' : 'slip';

  const validPackerLogId = Number.isFinite(packerLogId) && packerLogId > 0;
  if (!validPackerLogId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
        <p className="text-role-caption font-semibold text-white/70">Invalid packer log id</p>
      </div>
    );
  }

  const headerLabel = orderId.startsWith('PL-') ? `Pack ${orderId}` : `Order ${orderId}`;

  return (
    <MobilePackerPhotoStudio
      packerLogId={packerLogId}
      orderId={orderId}
      orderRowId={Number.isSafeInteger(orderRowId) && orderRowId > 0 ? orderRowId : null}
      headerLabel={headerLabel}
      returnHref={completePacking ? '/m/pick' : '/m/work'}
      maxPhotos={10}
      guided={guided}
      initialStep={initialStep}
      completePacking={completePacking}
      scanClientEventId={scanClientEventId}
      mobileScanEventId={mobileScanEventId}
    />
  );
}

export default function PackerPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-stage" />}>
      <PhotoPageInner />
    </Suspense>
  );
}
