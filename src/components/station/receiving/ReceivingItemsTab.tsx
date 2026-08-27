'use client';

import { PoLinesSection } from './PoLinesSection';

export function ReceivingItemsTab({
  receivingId,
  trackingNumber,
}: {
  receivingId: string;
  trackingNumber?: string;
}) {
  return (
    <div className="space-y-4">
      <PoLinesSection receivingId={receivingId} trackingNumber={trackingNumber} />
    </div>
  );
}
