'use client';

/**
 * Route-level loading shell for `/triage` — the house loading field, same as
 * `/unbox` (the two surfaces share the receiving shell, so they share the
 * loading face).
 *
 * It used to mount `RouteLoading`, a centred spinner over the words
 * "Loading triage…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading triage" className="h-full" />;
}
