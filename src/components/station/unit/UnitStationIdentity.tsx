'use client';

/**
 * Serial unit → `CartonContextCard` adapter — the ONE station identity face for
 * a unit, for any {@link EntityStationPane} consumer.
 *
 * Sibling of `OrderStationIdentity`. The carton header has no read-only twin
 * (root `AGENTS.md`), so a unit gets a thin MAPPING onto the same card, never a
 * second component.
 *
 * ## What the bar carries, and what it deliberately does not
 *
 * A unit's identity slots are the serial and its tracking. Everything else the
 * VM resolves — SKU, grade, status, location — goes to the CENTRE facts, not
 * here, and that is a decision rather than an omission:
 *
 *   • The card has no slot for any of them. Cramming SKU into `poDisplay` (a
 *     PO/order slot with `onEditPo` / `poOpenHref` semantics) is a page-local
 *     twin wearing the SoT's clothes.
 *   • It is the card's OWN rule. The lifecycle chip was deleted from it on
 *     2026-08-21 — "the bar is under constant width pressure" — after two passes
 *     failed to earn the space. Adding four unit facts back into the same strip
 *     would re-open exactly that decision.
 *
 * `poDisplay` carrying the serial is not a stretch of the slot: it is the LEAD
 * identifier slot in practice, and `OrderStationIdentity` already puts an order
 * number there while `ShippingEntityContextHeader` puts an order id.
 *
 * **Relationships are not identity.** No allocated order, no origin carton —
 * `unit-station-identity-vm.ts` says it and it matters here: a unit's header
 * must not change because an allocation did. Those are Displays leaves.
 */

import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { UnitStationIdentityVM } from './unit-station-identity-vm';

export function UnitStationIdentity({
  vm,
  tracking,
  onExitToList,
  exitLabel = 'Back to results',
}: {
  /** Built by `buildUnitStationIdentityVM` — the one unit mapping. */
  vm: UnitStationIdentityVM;
  /** The unit's own shipping tracking, when it has left the building. */
  tracking?: string | null;
  /** Identity ◁ — host must clear the focused unit. */
  onExitToList: () => void;
  exitLabel?: string;
}) {
  const trackingValue = String(tracking ?? '').trim();

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      // A unit has no carton photo set of its own on this surface, and no
      // classify vocabulary at all — platform / type / priority are carton
      // facts. Both clusters stand down rather than render inert controls.
      showStaffPhotoRow={false}
      showClassifyControls={false}
      classifyInteractive={false}
      // Inert: no receiving photos. Required prop, no meaningful default.
      photoStage="unbox_carton"
      listingLink=""
      listingOpenHref={null}
      listingLinks={[]}
      showListing={false}
      poOpenHref={null}
      trackingOpenHref={trackingValue ? getTrackingUrl(trackingValue) : null}
      // The lead identifier: the serial, or the minted uid when the unit never
      // carried one. `buildUnitStationIdentityVM` already resolved which.
      poDisplay={vm.leadDisplay}
      showOrderIdentity={false}
      linkedOrderNumber={null}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={trackingValue}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      platformValue=""
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
      exitLabel={exitLabel}
    />
  );
}
