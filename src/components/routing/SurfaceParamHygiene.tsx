'use client';

import { Suspense } from 'react';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';

/** Mounts the URL boundary parse for a surface — rule 2 of the isolation contract (`@/lib/routing/route-params`). */
export function SurfaceParamHygiene() {
  return (
    <Suspense fallback={null}>
      <HygieneEffect />
    </Suspense>
  );
}

function HygieneEffect() {
  useSurfaceParamHygiene();
  return null;
}
