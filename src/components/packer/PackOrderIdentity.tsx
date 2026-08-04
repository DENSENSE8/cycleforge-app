'use client';

/**
 * Packing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active pack order onto the two-row station identity face (order# ·
 * tracking) plus the manual send-to-phone pill — the packing counterpart of
 * the Unbox carton photo pill, which lives in the same trailing position.
 * Read-only — pack session identity comes from the scan / queue select.
 * Pair host with `reserveIdentityClearance="stacked"`.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import { packListingIdentity } from '@/components/packer/pack-listing-identity';
import { PackSendToPhoneButton } from '@/components/packer/PackSendToPhoneButton';
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

  // Listing + platform derive from the scanned item number (shared SoT with the
  // sidebar active-order chips) — read-only, so no local edit state.
  const { listingLink, listingOpenHref, platformValue } = packListingIdentity(sku || orderId);

  const packerLogId = Number(activeOrder.packerLogId);
  const canSendToPhone = Number.isFinite(packerLogId) && packerLogId > 0;

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <CartonContextCard
          receivingId={null}
          staffId=""
          isUnmatched={Boolean(activeOrder.isUnknownOrder)}
          showStaffPhotoRow={false}
          // Inert: receivingId is always null here, so the photo pill never
          // renders regardless of stage. Required prop, no meaningful default.
          photoStage="unbox_carton"
          // Classify is a receiving concern — a pack session's platform is
          // derived from the scanned item number, so the bar carries identity
          // chips only.
          showClassifyControls={false}
          listingLink={listingLink}
          listingOpenHref={listingOpenHref}
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
        />
      </div>

      {/* Trailing photo pill — same slot Unbox gives ReceivingPhotoButton. */}
      {canSendToPhone ? (
        <PackSendToPhoneButton
          packerLogId={packerLogId}
          orderId={orderId || null}
          tracking={tracking || null}
        />
      ) : null}
    </div>
  );
}
