'use client';

/**
 * Picks — `/m/pick`: a PICK LIST only (owner 2026-09-28). The walk's progress,
 * my pick list, and a floating Start picking — which walks my orders, then the
 * unowned ones, on the scan card (`?order=<id>`). See {@link PickScreen}.
 */

import { Suspense } from 'react';
import { PickScreen } from '@/components/mobile/picker/PickScreen';

export default function MobilePickPage() {
  return (
    <Suspense fallback={null}>
      <PickScreen />
    </Suspense>
  );
}
