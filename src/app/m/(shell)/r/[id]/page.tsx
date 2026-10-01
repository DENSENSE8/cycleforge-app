import { Suspense } from 'react';
import { MobileV2ReceivingCartonRecord } from '@/components/mobile/v2/receiving/MobileV2ReceivingCartonRecord';

export default function CartonRecordPage() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <MobileV2ReceivingCartonRecord />
    </Suspense>
  );
}
