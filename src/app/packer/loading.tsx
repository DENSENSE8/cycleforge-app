'use client';

/** Route-level loading shell for `/packer` (legacy alias of `/pack`) — the house loading field. */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading packing" className="h-full" />;
}
