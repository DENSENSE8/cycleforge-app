'use client';

/**
 * `/search?sel=receiving:` Items block — the same PO line surface as Unbox and
 * Testing, read-only. Routes through {@link PoItemsSection}, which owns the
 * matched-vs-unfound lane decision for every station.
 */

import { useMemo } from 'react';
import { PoItemsSection } from '@/components/receiving/workspace/PoItemsSection';
import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { searchReceivingActiveRow } from './search-receiving-active-row';

export function SearchReceivingPoItems({
  receiving,
  lines,
}: {
  receiving: CartonInspectorReceiving;
  lines: ReadonlyArray<CartonInspectorLine>;
}) {
  const row = useMemo(
    () => searchReceivingActiveRow(receiving, lines),
    [receiving, lines],
  );

  const receivingTypeHint = isReturnIntake(row)
    ? 'RETURN'
    : String(receiving.intake_type ?? '').trim();

  return (
    <PoItemsSection
      row={row}
      receivingId={receiving.id}
      embedded
      readOnly
      showSerialScan={false}
      unitsChrome={false}
      sourcePlatformHint={String(receiving.source_platform ?? '').trim() || undefined}
      receivingTypeHint={receivingTypeHint || undefined}
      listingUrlHint={receiving.listing_url ?? undefined}
      linkedOrderHint={{
        source: receiving.source,
        zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
        zoho_purchaseorder_number: receiving.zoho_purchaseorder_number,
      }}
    />
  );
}
