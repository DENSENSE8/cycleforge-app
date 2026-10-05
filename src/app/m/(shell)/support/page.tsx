import { Suspense } from 'react';
import { MobileSupportScreen } from '@/components/mobile/support/MobileSupportScreen';

export const dynamic = 'force-dynamic';

/**
 * `/m/support` — phone Support: the list (`?status=`, `q`) and one record
 * (`?item=<support item id>`) with internal notes and Log customer message.
 * Desk twin: `/support`.
 */
export default function MobileSupportPage() {
  return (
    <Suspense fallback={null}>
      <MobileSupportScreen />
    </Suspense>
  );
}
