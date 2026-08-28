'use client';

/**
 * Route-level loading shell for `/packer` (legacy alias of `/pack`) — the
 * house loading field.
 *
 * It used to mount `RouteLoading`, a centred spinner over the words
 * "Loading packing…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading packing" className="h-full" />;
}
