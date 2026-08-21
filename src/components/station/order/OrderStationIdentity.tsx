'use client';

/**
 * `ShippedOrder → CartonContextCard` adapter — the ONE station identity face
 * for an order, shared by every {@link EntityStationPane} consumer.
 *
 * Promoted 2026-08-20 out of `support/orders/SupportOrderIdentity.tsx`; the
 * mapping was never Support-specific, and `/search?sel=order:` needs the same
 * face. Maps an order onto the Unbox one-row identity (order# · tracking ·
 * classify). Classify is read-only here — an order's channel is a fact from the
 * marketplace, not an operator choice. Pair the host with `placement="flow"` +
 * `reserveIdentityClearance={false}`.
 *
 * The carton header has no read-only twin (root `AGENTS.md`): editability is a
 * PROP on this one card, never a second component.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ShippedOrder } from '@/types/orders';

export function OrderStationIdentity({
  order,
  onExitToList,
  exitLabel = 'Back to orders queue',
}: {
  order: ShippedOrder;
  /** Identity ◁ — host must clear the focused order (same as Unbox Back to list). */
  onExitToList: () => void;
  /** What ◁ returns to on this surface ("Back to results" on `/search`). */
  exitLabel?: string;
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
      exitLabel={exitLabel}
    />
  );
}
