'use client';

/**
 * /m/receive — deprecated Arrival alias. Prefer `/m/triage`.
 */

import MobileArrivalStation from '@/components/mobile/receiving/MobileArrivalStation';

/** @deprecated Prefer `/m/triage` — kept for deep links. */
export default function MobileReceivePage() {
  return <MobileArrivalStation />;
}
