'use client';

/**
 * Route-level loading shell for `/settings` — the house loading field.
 *
 * It used to mount `RouteLoading`, a centred spinner over the words
 * "Loading settings…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading settings" className="h-full" />;
}
