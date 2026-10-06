import { Suspense } from 'react';
import { MobileFulfilledJourney } from '@/components/mobile/fulfilled/MobileFulfilledJourney';

export const dynamic = 'force-dynamic';

/** `/m/fulfilled` — the post-ship journey on the phone (Act now · Watch · Done). Desk twin: `/fulfilled`. */
export default function MobileFulfilledPage() {
  return (
    <Suspense fallback={null}>
      <MobileFulfilledJourney />
    </Suspense>
  );
}
