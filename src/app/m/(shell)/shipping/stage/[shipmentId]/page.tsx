'use client';

import { useParams } from 'next/navigation';
import { MobileDockStagingTask } from '@/components/mobile/shipping/MobileDockStagingTask';

export default function MobileDockStagingTaskPage() {
  const params = useParams<{ shipmentId: string }>();
  return <MobileDockStagingTask shipmentId={Number(params.shipmentId)} />;
}
