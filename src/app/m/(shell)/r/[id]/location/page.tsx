'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { MobileV2LpnLocation } from '@/components/mobile/v2/receiving/MobileV2LpnLocation';

/** `/m/r/[id]/location` — the LPN location scan the Unbox desk sends to the phone. */
function LpnLocationInner() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Not an LPN id.</p>;
  }
  return <MobileV2LpnLocation receivingId={id} />;
}

export default function LpnLocationPage() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <LpnLocationInner />
    </Suspense>
  );
}
