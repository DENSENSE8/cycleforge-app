'use client';

/**
 * Route-level loading shell for `/unbox` — paints the Unbox workbench's real
 * anatomy the moment navigation starts. Shared SoT:
 * {@link UnboxWorkbenchSkeleton}.
 */

import { UnboxWorkbenchSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';

export default function UnboxLoading() {
  return <UnboxWorkbenchSkeleton />;
}
