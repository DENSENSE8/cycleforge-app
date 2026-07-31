'use client';

/**
 * Review · Packing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps a pack-review queue row onto the condensed identity bookmark
 * (order# · tracking). Sibling of PackOrderIdentity.
 */

import { useEffect, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';

export function ReviewOrderIdentity({ row }: { row: PackReviewQueueRow }) {
  const tracking = (row.tracking || row.detectedTracking || '').trim();
  const orderId = (row.orderId || '').trim();
  const title = orderId || `PL-${row.packerLogId}`;

  const [platformValue, setPlatformValue] = useState('');
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setPlatformValue('');
    setReceivingType('');
  }, [row.packerLogId]);

  return (
    <CartonContextCard
      density="bar"
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      // Inert: receivingId is always null here, so the photo pill never
      // renders regardless of stage. Required prop, no meaningful default.
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
      platformValue={platformValue}
      onPlatformSelect={setPlatformValue}
      receivingType={receivingType}
      onTypeSelect={setReceivingType}
    />
  );
}
