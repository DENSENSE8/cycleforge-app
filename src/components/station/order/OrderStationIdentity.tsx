'use client';

/**
 * Support · Orders adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps a ShippedOrder onto the Unbox one-row face (order# · tracking ·
 * classify). Classify is read-only; edits live in the order body / editor dock.
 * Pair host with `placement="flow"` + `reserveIdentityClearance={false}`.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ShippedOrder } from '@/types/orders';

export function SupportOrderIdentity({
  order,
  onExitToList,
}: {
  order: ShippedOrder;
  /** Identity ◁ — host must clear the focused order (same as Unbox Back to list). */
  onExitToList: () => void;
}) {
  const tracking = String(order.shipping_tracking_number || '').trim();
  const orderId = String(order.order_id || '').trim();
  const poDisplay = orderId || tracking || '—';
  const platformValue = String(order.account_source || '').trim();

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow
      classifyInteractive={false}
      // Inert: no receiving photos. Required prop, no meaningful default.
      photoStage="unbox_carton"
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
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
      exitLabel="Back to orders queue"
    />
  );
}
