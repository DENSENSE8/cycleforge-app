import { Suspense } from 'react';
import { MobileExceptionRecord } from '@/components/mobile/exceptions/MobileExceptionRecord';

export const dynamic = 'force-dynamic';

/**
 * `/m/exceptions/[key]` — one exception's record (`key` = `${kind}:${sourceId}`),
 * resolved in place by the phone resolver for its kind. A bare numeric segment
 * is an old order deep link (`/m/exceptions/<orderId>`) and lands on that
 * order's exception.
 */
export default function MobileExceptionRecordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <MobileExceptionRecord />
    </Suspense>
  );
}
