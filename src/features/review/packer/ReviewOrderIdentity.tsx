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

  const [listingLink, setListingLink] = useState('');
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [poEditorOpen, setPoEditorOpen] = useState(false);
  const [poNumberEdit, setPoNumberEdit] = useState(title);
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  const [trackingEdit, setTrackingEdit] = useState(tracking);
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  const [platformValue, setPlatformValue] = useState('');
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setPoNumberEdit(title);
    setTrackingEdit(tracking);
    setExtraTrackings([]);
    setListingEditorOpen(false);
    setPoEditorOpen(false);
    setTrackingEditorsOpen(false);
  }, [row.packerLogId, title, tracking]);

  return (
    <CartonContextCard
      density="bar"
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      listingLink={listingLink}
      setListingLink={setListingLink}
      listingEditorOpen={listingEditorOpen}
      setListingEditorOpen={setListingEditorOpen}
      listingOpenHref={null}
      listingLinks={[]}
      poOpenHref={null}
      trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
      poDisplay={title}
      linkedOrderNumber={orderId || null}
      poEditorOpen={poEditorOpen}
      setPoEditorOpen={setPoEditorOpen}
      poNumberEdit={poNumberEdit}
      setPoNumberEdit={setPoNumberEdit}
      onCommitPoNumber={() => {
        /* review session — order id is read-only */
      }}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={tracking}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      trackingEditorsOpen={trackingEditorsOpen}
      onToggleTrackingEditors={() => setTrackingEditorsOpen((v) => !v)}
      trackingEdit={trackingEdit}
      setTrackingEdit={setTrackingEdit}
      onCommitTracking={() => {
        /* review session — tracking comes from pack capture */
      }}
      extraTrackings={extraTrackings}
      setExtraTrackings={setExtraTrackings}
      platformValue={platformValue}
      onPlatformSelect={setPlatformValue}
      receivingType={receivingType}
      onTypeSelect={setReceivingType}
    />
  );
}
