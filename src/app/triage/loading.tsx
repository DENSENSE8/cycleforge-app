'use client';

/** Route-level loading shell for `/triage` — the house loading field, same as `/unbox` (the two surfaces share the receiving shell, so they… */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading triage" className="h-full" />;
}
