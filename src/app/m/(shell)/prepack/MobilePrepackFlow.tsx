'use client';

import { PrepackSerialScan } from '@/components/mobile/prepack/PrepackSerialScan';
import { PrepackForm } from '@/features/prepack/PrepackForm';
import type { PrepackRouteState } from '@/lib/nav/route-tree';

/** The phone's prepack form: the shared form with the camera serial scan. */
export function MobilePrepackFlow({ initial }: { initial: PrepackRouteState }) {
  return <PrepackForm surface="mobile" initial={initial} serialEntry={PrepackSerialScan} />;
}
