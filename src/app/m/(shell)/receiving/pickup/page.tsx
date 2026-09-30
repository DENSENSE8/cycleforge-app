import { Suspense } from 'react';
import { MobilePickupScreen } from '@/components/mobile/receiving/MobilePickupScreen';

/** `/m/receiving/pickup` — local pickups on the phone; `?lcpu=<id>` opens the shared pickup record. */
export default function MobileLocalPickupPage() {
  return (
    <Suspense fallback={null}>
      <MobilePickupScreen />
    </Suspense>
  );
}
