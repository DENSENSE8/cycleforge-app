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
  const [platformValue, setPlatformValue] = useState('');
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setListingLink('');
    setPlatformValue('');
    setReceivingType('');
  }, [activeOrder.orderRowId, activeOrder.orderId, activeOrder.tracking]);

  return (
    <CartonContextCard
      density="bar"
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      listingLink={listingLink}
      listingOpenHref={null}
      listingLinks={[]}
      poOpenHref={null}
      trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
      poDisplay={poDisplay}
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
