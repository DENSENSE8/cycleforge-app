'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobilePackerPhotoStudio } from '@/components/mobile/photos/MobilePackerPhotoStudio';

function PhotoPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const packerLogId = Number(params?.id);
  const orderId = searchParams.get('orderId') || `PL-${packerLogId}`;
  // Guided Review capture is the default for /m/p/{id}/photos (plan §2b). A
  // bare open (no ?step=) still runs slip→box→confirm; `?step=box` resumes at
  // the box step (desktop deep-link / re-entry). `?mode=spam` keeps the legacy
  // free-capture path for operators who only need extra evidence shots.
  const stepParam = searchParams.get('step');
  const spamMode = searchParams.get('mode') === 'spam';
  const guided = !spamMode;
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
      headerLabel={headerLabel}
      returnHref="/m/pack"
      maxPhotos={10}
      guided={guided}
      initialStep={initialStep}
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
