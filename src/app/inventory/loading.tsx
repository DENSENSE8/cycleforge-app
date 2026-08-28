'use client';

/**
 * Route-level loading shell for `/inventory` — the house loading field.
 *
 * It used to mount `RouteLoading`, a centred spinner over the words
 * "Loading inventory…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading inventory" className="h-full" />;
}
