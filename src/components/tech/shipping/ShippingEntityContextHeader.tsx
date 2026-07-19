'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from '@/components/Icons';
import { CartonContextCard } from '@/components/station/entity-context';
import { WorkspaceCard } from '@/design-system/components';
import { isEmptyDisplayValue } from '@/utils/empty-display-value';
import {
  getExternalUrlByItemNumber,
  getPlatformKeyByItemNumber,
  getPlatformLabelByItemNumber,
} from '@/utils/external-item-url';
import { getTrackingUrl } from '@/utils/order-links';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { CartonListingLink } from '@/lib/receiving/listing-links';

/**
 * Shipping adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active outbound order onto the Unbox condensed identity row
 * (listing · order# · tracking). Claim / photos / classify are omitted —
 * the ship session stays scan-driven.
 */
export function ShippingEntityContextHeader({
  activeOrder,
  outOfStock,
  // Close the active scanned order → the right pane crossfades back to the list.
  // Shared by two surfaces (tech ship-confirm + outbound labels); each passes its
  // own close handler. Omit to hide the back button.
  onExitToList,
}: {
  activeOrder: ActiveStationOrder;
  outOfStock?: string | null;
  onExitToList?: () => void;
}) {
  const tracking = String(activeOrder.tracking || '').trim();
  const orderId = String(activeOrder.orderId || '').trim();

  const itemNumberRaw = String(activeOrder.itemNumber || '').trim();
  const itemNumberValue = isEmptyDisplayValue(activeOrder.itemNumber) ? '' : itemNumberRaw;
  const listingItemKey = itemNumberValue || String(activeOrder.sku || '').trim();
  const listingUrl = getExternalUrlByItemNumber(listingItemKey);
  const listingPlatformLabel = listingItemKey
    ? getPlatformLabelByItemNumber(listingItemKey)
    : null;
  const platformKey = listingItemKey ? getPlatformKeyByItemNumber(listingItemKey) : '';

  const listingLinks = useMemo<CartonListingLink[]>(() => {
    if (!listingUrl) return [];
    const label =
      listingPlatformLabel && listingPlatformLabel !== 'Unknown'
        ? listingPlatformLabel
        : 'Listing';
    return [{ href: listingUrl, label, source: 'derived' }];
  }, [listingUrl, listingPlatformLabel]);

  const [listingLink, setListingLink] = useState(listingUrl ?? '');
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [poEditorOpen, setPoEditorOpen] = useState(false);
  const [poNumberEdit, setPoNumberEdit] = useState(orderId);
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  const [trackingEdit, setTrackingEdit] = useState(tracking);
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  const [platformValue, setPlatformValue] = useState(platformKey);
  const [receivingType, setReceivingType] = useState('');

  // Keep local drafts in sync when the scanned order changes.
  useEffect(() => {
    setListingLink(listingUrl ?? '');
    setPoNumberEdit(orderId);
    setTrackingEdit(tracking);
    setExtraTrackings([]);
    setPlatformValue(platformKey);
    setListingEditorOpen(false);
    setPoEditorOpen(false);
    setTrackingEditorsOpen(false);
  }, [activeOrder.orderId, activeOrder.tracking, listingItemKey, listingUrl, orderId, platformKey, tracking]);

  const hasOutOfStock = Boolean(String(outOfStock || '').trim());

  return (
    <div className="space-y-3">
      <CartonContextCard
        receivingId={null}
        staffId=""
        isUnmatched={false}
        showStaffPhotoRow={false}
        listingLink={listingLink}
        setListingLink={setListingLink}
        listingEditorOpen={listingEditorOpen}
        setListingEditorOpen={setListingEditorOpen}
        listingOpenHref={listingUrl}
        listingLinks={listingLinks}
        poOpenHref={null}
        trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
        poDisplay={orderId}
        linkedOrderNumber={orderId}
        poEditorOpen={poEditorOpen}
        setPoEditorOpen={setPoEditorOpen}
        poNumberEdit={poNumberEdit}
        setPoNumberEdit={setPoNumberEdit}
        onCommitPoNumber={() => {
          /* ship session — order id is read-only */
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
          /* ship session — tracking comes from the scanned order */
        }}
        extraTrackings={extraTrackings}
        setExtraTrackings={setExtraTrackings}
        platformValue={platformValue}
        onPlatformSelect={setPlatformValue}
        receivingType={receivingType}
        onTypeSelect={setReceivingType}
        onExitToList={onExitToList}
      />

      {hasOutOfStock ? (
        <WorkspaceCard label="Out of stock" tone="red" bodyClassName="px-5 py-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-red-800">
              {outOfStock}
            </p>
          </div>
        </WorkspaceCard>
      ) : null}
    </div>
  );
}
