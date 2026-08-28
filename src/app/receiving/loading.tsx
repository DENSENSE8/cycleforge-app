'use client';

/**
 * Route-level loading shell for `/receiving` (legacy alias family) — the
 * house loading field.
 *
 * It used to mount `RouteLoading`, a centred spinner over the words
 * "Loading receiving…". SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function Loading() {
  return <UniversalLoader isLoading label="Loading receiving" className="h-full" />;
}
