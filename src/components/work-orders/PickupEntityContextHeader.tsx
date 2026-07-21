'use client';

import { useEffect, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import type { CartLine } from './localPickupStore';

/**
 * Local Pickup adapter for the station entity-context header SoT.
 *
 * A staged pickup has no receiving row, claim, photos, or carrier tracking yet,
 * so those affordances stay omitted. The SKU occupies the copyable identifier
 * slot and the Pickup fulfillment pill makes the no-tracking state explicit.
 * Mount inside {@link StationContextBar}; product/SKU details stay in the
 * workbench body via {@link PickupProductSummary}.
 */
export function PickupEntityContextHeader({
  selected,
}: {
  selected: CartLine | null;
}) {
  const sku = selected?.sku.trim() ?? '';

  const [listingLink, setListingLink] = useState('');
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [poEditorOpen, setPoEditorOpen] = useState(false);
  const [poNumberEdit, setPoNumberEdit] = useState(sku);
  const [trackingEditorsOpen, setTrackingEditorsOpen] = useState(false);
  const [trackingEdit, setTrackingEdit] = useState('');
  const [extraTrackings, setExtraTrackings] = useState<string[]>([]);
  const [platformValue, setPlatformValue] = useState('');
  const [receivingType, setReceivingType] = useState('PICKUP');

  useEffect(() => {
    setPoNumberEdit(sku);
    setListingEditorOpen(false);
    setPoEditorOpen(false);
    setTrackingEditorsOpen(false);
  }, [selected?.key, sku]);

  return (
    <CartonContextCard
      density="bar"
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      listingLink={listingLink}
      setListingLink={setListingLink}
      showListing={false}
      listingEditorOpen={listingEditorOpen}
      setListingEditorOpen={setListingEditorOpen}
      listingOpenHref={null}
      listingLinks={[]}
      poOpenHref={null}
      trackingOpenHref={null}
      poDisplay={sku}
      showOrderIdentity={Boolean(sku)}
      poEditable={false}
      linkedOrderNumber={null}
      poEditorOpen={poEditorOpen}
      setPoEditorOpen={setPoEditorOpen}
      poNumberEdit={poNumberEdit}
      setPoNumberEdit={setPoNumberEdit}
      onCommitPoNumber={() => {
        /* staged intake — SKU identity is read-only */
      }}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed=""
      filledExtraTrackingsCount={0}
      isLocalPickup
      trackingEditorsOpen={trackingEditorsOpen}
      onToggleTrackingEditors={() => setTrackingEditorsOpen((value) => !value)}
      trackingEdit={trackingEdit}
      setTrackingEdit={setTrackingEdit}
      onCommitTracking={() => {
        /* local pickup has no carrier tracking */
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

/** Product/SKU summary — mount below {@link StationContextBar}, not inside it. */
export function PickupProductSummary({ selected }: { selected: CartLine | null }) {
  const sku = selected?.sku.trim() ?? '';
  const title = selected?.product_title.trim() || 'New intake';

  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-1">
      <div className="min-w-0">
        <dt className="text-role-eyebrow uppercase tracking-wider text-text-faint">
          Product
        </dt>
        <dd className="truncate text-xs font-bold text-text-default" title={title}>
          {title}
        </dd>
      </div>
      <div className="min-w-20 text-right">
        <dt className="text-role-eyebrow uppercase tracking-wider text-text-faint">
          SKU
        </dt>
        <dd className="truncate font-mono text-xs font-bold text-text-default">
          {sku || '—'}
        </dd>
      </div>
    </dl>
  );
}
