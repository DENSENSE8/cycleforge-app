'use client';

/** Review · Packing adapter for the station entity-context header SoT (`CartonContextCard` via `@/components/station/entity-context`). */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';

export function ReviewOrderIdentity({
  row,
  onExitToList,
}: {
  row: PackReviewQueueRow;
  /** Identity ◁ — host must clear packerLogId / overlay selection. */
  onExitToList: () => void;
}) {
  const tracking = (row.tracking || row.detectedTracking || '').trim();
  const orderId = (row.orderId || '').trim();
  const title = orderId || `PL-${row.packerLogId}`;

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow
      classifyInteractive={false}
      // Inert: no receiving photos; review has no photosCell. Required prop.
      photoStage="unbox_carton"
      listingLink=""
      listingOpenHref={null}
      listingLinks={[]}
      poOpenHref={null}
      trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
      poDisplay={title}
      linkedOrderNumber={orderId || null}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={tracking}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      platformValue=""
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
      exitLabel="Return to review table"
    />
  );
}
