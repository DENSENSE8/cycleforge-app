'use client';

/**
 * Root route-level loading shell — the house loading field.
 *
 * It used to mount `RouteLoading`, a centred spinner over the word
 * "Loading…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading" className="h-full" />;
}
