'use client';

/** Route-level loading shell for `/unbox` — the house loading field, not a hand-drawn copy of the workbench. */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function UnboxLoading() {
  return <UniversalLoader isLoading label="Loading Unbox" className="h-full" />;
}
