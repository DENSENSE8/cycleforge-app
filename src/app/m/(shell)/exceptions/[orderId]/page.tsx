'use client';

import { useParams } from 'next/navigation';
import { MobileOrderExceptionTask } from '@/components/mobile/outbound/MobileOrderExceptionTask';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobileOrderExceptionTaskPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = Number(params?.orderId);
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileOrderExceptionTask orderId={orderId} />
    </ModeRegion>
  );
}
