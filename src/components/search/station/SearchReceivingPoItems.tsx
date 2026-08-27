'use client';

/**
 * `/search?sel=receiving:` Items block — the same PO line surface as Unbox,
 * read-only. Routes through {@link PoLinesAccordion} / {@link UnmatchedItemsSection}
 * (not a forked item-record mapper).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PoLinesAccordion } from '@/components/receiving/workspace/PoLinesAccordion';
import { UnmatchedItemsSection } from '@/components/receiving/workspace/UnmatchedItemsSection';
import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import {
  shouldUsePoAccordion,
  shouldUseUnmatchedItemsSurface,
} from '@/lib/receiving/intake-items-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { searchReceivingActiveRow } from './search-receiving-active-row';

interface SiblingsResponse {
  success: boolean;
  receiving_lines: unknown[];
}

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
  const receivingId = receiving.id;
  const wantsPoAccordion = shouldUsePoAccordion(row);
  const queryKey = useMemo(
    () => receivingSiblingsQueryKey(receivingId),
    [receivingId],
  );

  const { data, isPending } = useQuery<SiblingsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Failed to fetch receiving lines');
      return res.json();
    },
    enabled: wantsPoAccordion,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const siblingCount = data?.receiving_lines?.length;
  const linelessRealPo =
    wantsPoAccordion &&
    !isPending &&
    (siblingCount === undefined ? false : siblingCount === 0);
  const useUnmatchedSurface =
    shouldUseUnmatchedItemsSurface(row) || linelessRealPo;

  const receivingTypeHint = isReturnIntake(row)
    ? 'RETURN'
    : String(receiving.intake_type ?? '').trim();

  if (useUnmatchedSurface) {
    return (
      <UnmatchedItemsSection
        receivingId={receivingId}
        embedded
        suppressHeader
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
        activeLineId={row.id}
        placeholderActiveRow={row.id > 0 ? row : undefined}
      />
    );
  }

  return (
    <PoLinesAccordion
      receivingId={receivingId}
      activeLineId={row.id}
      embedded
      suppressHeader
      readOnly
      unitsChrome={false}
      placeholderActiveRow={row.id > 0 ? row : undefined}
    />
  );
}
