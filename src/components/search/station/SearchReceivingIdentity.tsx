'use client';

/**
 * Search carton identity — the same {@link CartonContextCard} face Unbox uses
 * (`LineCartonContextSection`). Preview stance: classify is read-only; photos /
 * price / listing stay on the top-right even when empty.
 */

import { useMemo } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import {
  cartonHeaderIdentity,
  type CartonInspectorLine,
  type CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import { useCartonPoTotal } from '@/components/receiving/workspace/line-edit/hooks/useCartonPoTotal';
import { listingLinksForReceivingRow } from '@/lib/receiving/listing-links';
import { normalizeListingHref } from '@/lib/receiving/listing-href';
import { resolveTrackingOpenUrl } from '@/lib/tracking-format';
import { useAuth } from '@/contexts/AuthContext';
import { storedOrInferredSourcePlatform } from '@/lib/marketplace-order-id';
import type { ShippedOrder } from '@/types/orders';

function receivingIsUnmatched(receiving: CartonInspectorReceiving): boolean {
  const source = String(receiving.source ?? '').trim().toLowerCase();
  const pairing = String(receiving.pairing_state ?? '').trim().toUpperCase();
  return source === 'unmatched' || pairing === 'UNFOUND';
}

function poOpenHrefForReceiving(receiving: CartonInspectorReceiving): string | null {
  const id = String(receiving.zoho_purchaseorder_id ?? '').trim();
  if (id) {
    return `https://inventory.zoho.com/app#/purchaseorders/${encodeURIComponent(id)}`;
  }
  const number = String(receiving.zoho_purchaseorder_number ?? '').trim();
  if (number) {
    return `https://inventory.zoho.com/app#/purchaseorders?search_text=${encodeURIComponent(number)}`;
  }
  return null;
}

export function SearchReceivingIdentity({
  receiving,
  lines,
  linkedOrder,
  onOpenPhotosDisplay,
}: {
  receiving: CartonInspectorReceiving;
  lines?: ReadonlyArray<CartonInspectorLine> | null;
  linkedOrder?: ShippedOrder | null;
  /** Unbox grammar: double-click Photos → Displays → Photos. */
  onOpenPhotosDisplay?: () => void;
}) {
  const { user } = useAuth();
  const header = useMemo(() => cartonHeaderIdentity(receiving, lines), [receiving, lines]);
  const poTotal = useCartonPoTotal(receiving.id);

  const listingLinks = useMemo(
    () =>
      listingLinksForReceivingRow(
        {
          receiving_listing_url: receiving.listing_url,
          receiving_zoho_notes: receiving.zoho_notes,
          sku: lines?.[0]?.sku ?? null,
          source_platform: receiving.source_platform,
          zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
        },
        { isUnmatched: receivingIsUnmatched(receiving) },
      ),
    [receiving, lines],
  );

  const listingOpenHref =
    listingLinks[0]?.href ??
    (normalizeListingHref(receiving.listing_url ?? '') || null);

  const poDisplay =
    header.poNumber ||
    header.productTitle ||
    header.tracking ||
    `R-${receiving.id}`;

  const tracking = header.tracking ?? '';
  const linkedOrderNumber = String(linkedOrder?.order_id ?? '').trim() || null;

  return (
    <CartonContextCard
      receivingId={receiving.id}
      staffId={String(user?.staffId ?? '')}
      isUnmatched={receivingIsUnmatched(receiving)}
      showStaffPhotoRow
      classifyInteractive={false}
      photoStage="unbox_carton"
      poTotal={poTotal}
      showPoTotal
      listingLink={receiving.listing_url ?? ''}
      listingOpenHref={listingOpenHref}
      listingLinks={listingLinks}
      poOpenHref={poOpenHrefForReceiving(receiving)}
      trackingOpenHref={tracking ? resolveTrackingOpenUrl(tracking, receiving.carrier) : null}
      poDisplay={poDisplay}
      linkedOrderNumber={linkedOrderNumber}
      lineId={lines?.[0]?.id ?? null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={tracking}
      filledExtraTrackingsCount={0}
      carrierHint={receiving.carrier}
      isLocalPickup={Boolean(String(receiving.local_pickup_order_id ?? '').trim())}
      platformValue={storedOrInferredSourcePlatform(
        receiving.source_platform,
        receiving.zoho_purchaseorder_number,
        receiving.zoho_purchaseorder_id,
        header.poNumber,
      )}
      onPlatformSelect={() => {}}
      receivingType={String(receiving.intake_type ?? '').trim()}
      onTypeSelect={() => {}}
      onOpenPhotosDisplay={onOpenPhotosDisplay}
    />
  );
}
