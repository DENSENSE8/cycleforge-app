'use client';

/** Route-level loading shell for `/pick` — the house loading field ({@link UniversalLoader}). */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading picker" className="h-full" />;
}
