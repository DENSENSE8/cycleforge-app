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

  const [platformValue, setPlatformValue] = useState(String(order.account_source || ''));
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setPlatformValue(String(order.account_source || ''));
  }, [order.id, order.order_id, order.shipping_tracking_number, order.account_source]);

  return (
    <CartonContextCard
      density="bar"
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      listingLink=""
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
