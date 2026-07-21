'use client';

/**
 * Support · Orders adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Mirrors PackOrderIdentity — maps a ShippedOrder onto the condensed identity
 * row (order# · tracking). Read-only in this mode; edits live in the Order tab
 * / editor dock.
 */

import { useEffect, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ShippedOrder } from '@/types/orders';

export function SupportOrderIdentity({ order }: { order: ShippedOrder }) {
  const tracking = String(order.shipping_tracking_number || '').trim();
  const orderId = String(order.order_id || '').trim();
  const poDisplay = orderId || tracking || '—';

  const [listingLink, setListingLink] = useState('');
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [poEditorOpen, setPoEditorOpen] = useState(false);
  const [poNumberEdit, setPoNumberEdit] = useState(poDisplay);
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  const [trackingEdit, setTrackingEdit] = useState(tracking);
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  const [platformValue, setPlatformValue] = useState(String(order.account_source || ''));
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setPoNumberEdit(poDisplay);
    setTrackingEdit(tracking);
    setExtraTrackings([]);
    setListingEditorOpen(false);
    setPoEditorOpen(false);
    setTrackingEditorsOpen(false);
    setPlatformValue(String(order.account_source || ''));
  }, [order.id, order.order_id, order.shipping_tracking_number, order.account_source, poDisplay, tracking]);

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
        /* support orders — identity is read-only; edits in Order tab */
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
        /* support orders — tracking edits via Order tab shipping fields */
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
