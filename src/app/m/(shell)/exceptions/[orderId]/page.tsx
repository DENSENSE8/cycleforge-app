'use client';

import { useParams } from 'next/navigation';
import { MobileOrderExceptionTask } from '@/components/mobile/outbound/MobileOrderExceptionTask';

export default function MobileOrderExceptionTaskPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = Number(params?.orderId);
  return (
    <MobileOrderExceptionTask orderId={orderId} />
  );
}
