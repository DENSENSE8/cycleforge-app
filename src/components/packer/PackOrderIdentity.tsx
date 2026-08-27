'use client';

/**
 * Packing adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active pack order onto the Unbox one-row face (order# · tracking ·
 * classify · listing · photos). Photos mount via `photosCell` (Pack send-to-
 * phone) — never a sibling beside the card. Classify is read-only (no
 * receiving row to persist). Pair host with `placement="flow"` +
 * `reserveIdentityClearance={false}` (Unbox-family flat centre). Displays `←|`
 * lives on ScanStationUtilityRail, not inside this identity adapter.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import { resolvePackOrderIdentityChips } from '@/components/packer/pack-order-identity-chips';
import { PackSendToPhoneButton } from '@/components/packer/PackSendToPhoneButton';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

export function PackOrderIdentity({
  activeOrder,
  onExitToList,
}: {
  activeOrder: PackActiveOrderPane;
  /** Identity ◁ — host must dispatch pack-active-order-changed(null). */
  onExitToList: () => void;
}) {
  const chips = resolvePackOrderIdentityChips(activeOrder);

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={Boolean(activeOrder.isUnknownOrder)}
      // Urgency · platform · type cluster — same Unbox face; read-only (no
      // receiving row). Urgency derives from platform when showStaffPhotoRow.
      showStaffPhotoRow
      classifyInteractive={false}
      // Inert for ReceivingPhotoButton; pack photos use photosCell below.
      photoStage="unbox_carton"
      listingLink={chips.listingLink}
      listingOpenHref={chips.listingOpenHref}
      listingLinks={chips.listingLinks}
      poOpenHref={null}
      trackingOpenHref={chips.tracking ? getTrackingUrl(chips.tracking) : null}
      poDisplay={chips.poDisplay}
      linkedOrderNumber={chips.orderId || null}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={chips.tracking}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      platformValue={chips.platformValue}
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
      exitLabel="Return to pack queue"
      photosCell={
        chips.canSendToPhone ? (
          <PackSendToPhoneButton
            packerLogId={chips.packerLogId}
            orderId={chips.orderId || null}
            tracking={chips.tracking || null}
          />
        ) : null
      }
    />
  );
}
