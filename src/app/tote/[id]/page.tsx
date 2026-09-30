'use client';

/** Desktop tote record — `/tote/[id]` (id or plate code; the phone keeps `/m/h/[id]`). */

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ToteRecord } from '@/components/receiving/ToteRecord';

function TotePageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const toteRef = decodeURIComponent(String(params?.id ?? '')).trim();
  return <ToteRecord toteRef={toteRef} onBack={() => router.back()} />;
}

export default function TotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-canvas" />}>
      <TotePageInner />
    </Suspense>
  );
}
