'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { MobileV2ArrivalPlacement } from '@/components/mobile/v2/receiving/MobileV2ArrivalPlacement';

/** `/m/r/[id]/place` — put the just-arrived carton on its urgency shelf. */
function CartonPlaceInner() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Not a carton id.</p>;
  }
  return <MobileV2ArrivalPlacement receivingId={id} />;
}

export default function CartonPlacePage() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <CartonPlaceInner />
    </Suspense>
  );
}
