'use client';

/**
 * Route-level loading shell for `/unbox` — the house loading field, not a
 * hand-drawn copy of the workbench.
 *
 * It used to mount `UnboxWorkbenchSkeleton`, a bar-for-bar mirror of Unbox's
 * three-band chrome. That mirror had to be re-cut every time the real chrome
 * moved, and drifted from it in between; the field has no geometry to keep in
 * sync. SoT: {@link UniversalLoader}.
 */

import { UniversalLoader } from '@/design-system/components/UniversalLoader';

export default function UnboxLoading() {
  return <UniversalLoader isLoading label="Loading Unbox" className="h-full" />;
}
