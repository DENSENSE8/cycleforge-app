'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobilePackerPhotoStudio } from '@/components/mobile/photos/MobilePackerPhotoStudio';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { PACKING_PATHS } from '@/lib/nav/route-tree';

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
  // Verify & finish after ✓ is the default; `?mode=spam` is the bare capture.
  const guided = searchParams.get('mode') !== 'spam';
  const completePacking = searchParams.get('complete') === '1';
  const title = searchParams.get('title')?.trim() || null;

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
      // A new desk scan replaces /m/p/<id>/photos in place: a fresh studio per pack, no carried-over count or Verify state.
      key={packerLogId}
      packerLogId={packerLogId}
      orderId={orderId}
      orderRowId={Number.isSafeInteger(orderRowId) && orderRowId > 0 ? orderRowId : null}
      headerLabel={headerLabel}
      productTitle={title}
      // Close always lands on the Packing photo feed unless the opener named another `?back=`.
      returnHref={mobileJobReturn(searchParams.get('back')) ?? PACKING_PATHS.mobile}
      guided={guided}
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
