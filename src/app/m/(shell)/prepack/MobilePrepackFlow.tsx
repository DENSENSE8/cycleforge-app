'use client';

import { PrepackSerialScan } from '@/components/mobile/prepack/PrepackSerialScan';
import { PrepackFlow } from '@/features/prepack/PrepackFlow';
import type { PrepackRouteState } from '@/lib/nav/route-tree';

/** The phone's prepack form: the shared flow with the camera serial scan. */
export function MobilePrepackFlow({ initial }: { initial: PrepackRouteState }) {
  return <PrepackFlow surface="mobile" initial={initial} serialEntry={PrepackSerialScan} />;
}
