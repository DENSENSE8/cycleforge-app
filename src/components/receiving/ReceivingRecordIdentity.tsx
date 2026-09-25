'use client';

import { useOrderChannel } from '@/hooks/useCatalog';
import { receivingRecordIdentity } from '@/lib/receiving/record-identity';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { RecordPlatformFace, RecordListingLink } from '@/design-system/components/record-ledger/RecordIdentity';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';

export function ReceivingRecordPlatform({ row }: { row: ReceivingLineRow }) {
  const identity = receivingRecordIdentity(row);
  const channel = useOrderChannel()(identity.orderNumber, identity.accountSource);
  return <RecordPlatformFace channel={channel} />;
}

export function ReceivingRecordItem({ row }: { row: ReceivingLineRow }) {
  const { listingHref, itemNumber } = receivingRecordIdentity(row);
  return (
    <span className="pointer-events-auto ml-auto inline-flex h-full shrink-0 items-center" data-testid="receiving-item-number">
      <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>ITEM</span>
      <RecordListingLink href={listingHref} itemNumber={itemNumber} face="value" />
    </span>
  );
}
