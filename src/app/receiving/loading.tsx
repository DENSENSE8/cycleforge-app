'use client';

/** Route-level loading shell for `/receiving` (legacy alias family) — the house loading field. */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading receiving" className="h-full" />;
}
