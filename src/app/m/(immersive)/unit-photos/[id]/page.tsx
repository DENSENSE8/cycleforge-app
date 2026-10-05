'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobileUnitPhotoStudio } from '@/components/mobile/photos/MobileUnitPhotoStudio';
import { parsePhotoAspect } from '@/lib/photos/photo-aspects';

/** Immersive (fullscreen) SERIAL_UNIT testing-photo capture surface — the phone lands here from the packer testing-label scan… */
function UnitPhotoPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const serialUnitId = Number(params?.id);
  const requestId = (searchParams.get('requestId') || '').trim() || null;
  const unitKey = (searchParams.get('unit') || '').trim() || null;
  const titleParam = (searchParams.get('title') || '').trim();
  const backParam = (searchParams.get('back') || '').trim();
  const stageParam = (searchParams.get('stage') || '').trim().toLowerCase();
  const stage = stageParam === 'packing' || stageParam === 'prepack' ? stageParam : 'testing';
  const packerLogIdRaw = Number(searchParams.get('packerLogId'));
  const packerLogId =
    Number.isFinite(packerLogIdRaw) && packerLogIdRaw > 0 ? packerLogIdRaw : null;
  const poRef = (searchParams.get('poRef') || '').trim() || null;
  const aspect = parsePhotoAspect(searchParams.get('aspect'));

  const validId = Number.isFinite(serialUnitId) && serialUnitId > 0;
  const headerLabel = titleParam || (unitKey ? `Unit ${unitKey}` : `Unit #${serialUnitId}`);
  const backHref = backParam || '/m/scan';

  if (!validId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold text-white/70">Invalid unit id</p>
      </div>
    );
  }

  return (
    <MobileUnitPhotoStudio
      serialUnitId={serialUnitId}
      unitKey={unitKey}
      headerLabel={headerLabel}
      returnHref={backHref}
      requestId={requestId}
      maxPhotos={10}
      stage={stage}
      packerLogId={packerLogId}
      poRef={poRef}
      aspect={aspect}
    />
  );
}

export default function UnitPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-stage" />}>
      <UnitPhotoPageInner />
    </Suspense>
  );
}
