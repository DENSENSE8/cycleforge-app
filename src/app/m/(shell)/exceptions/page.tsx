import { Suspense } from 'react';
import { MobileExceptionsHub } from '@/components/mobile/exceptions/MobileExceptionsHub';

export const dynamic = 'force-dynamic';

/** `/m/exceptions` — the Exceptions hub on the phone, every kind (`?domain=` / `?kind=`). Desk twin: `/exceptions`. */
export default function MobileExceptionsPage() {
  return (
    <Suspense fallback={null}>
      <MobileExceptionsHub />
    </Suspense>
  );
}
