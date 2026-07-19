'use client';

/**
 * Packing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active pack order onto the condensed identity row (order# · tracking).
 * Read-only — pack session identity comes from the scan / queue select.
 */

import { useEffect, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

export function PackOrderIdentity({
  activeOrder,
}: {
  activeOrder: PackActiveOrderPane;
}) {
  const tracking = String(activeOrder.tracking || '').trim();
  const orderId = String(activeOrder.orderId || '').trim();
  const sku = String(activeOrder.sku || '').trim();
  const poDisplay =
    activeOrder.scanType === 'SKU'
      ? sku || orderId || tracking || '—'
      : activeOrder.scanType === 'UNIT'
        ? orderId || sku || '—'
        : orderId || tracking || '—';

  const [listingLink, setListingLink] = useState('');
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [poEditorOpen, setPoEditorOpen] = useState(false);
  const [poNumberEdit, setPoNumberEdit] = useState(poDisplay);
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  const [trackingEdit, setTrackingEdit] = useState(tracking);
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  const [platformValue, setPlatformValue] = useState('');
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setPoNumberEdit(poDisplay);
    setTrackingEdit(tracking);
    setExtraTrackings([]);
    setListingEditorOpen(false);
    setPoEditorOpen(false);
    setTrackingEditorsOpen(false);
  }, [activeOrder.orderRowId, activeOrder.orderId, activeOrder.tracking, poDisplay, tracking]);

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
      poDisplay={poDisplay}
      linkedOrderNumber={orderId || null}
      poEditorOpen={poEditorOpen}
      setPoEditorOpen={setPoEditorOpen}
      poNumberEdit={poNumberEdit}
      setPoNumberEdit={setPoNumberEdit}
      onCommitPoNumber={() => {
        /* pack session — order id is read-only */
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
        /* pack session — tracking comes from the scanned order */
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
