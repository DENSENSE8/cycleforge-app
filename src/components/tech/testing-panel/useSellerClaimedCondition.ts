'use client';

/**
 * Testing QC — resolve seller-claimed condition from real sold-as /
 * listing_condition facts (never warehouse condition_grade).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  orderIdHintForSellerClaim,
  resolveSellerClaimedCondition,
  type SellerClaimedCondition,
} from '@/lib/receiving/seller-claimed-condition';
import { sellerClaimedFactsQuery } from '@/lib/queries/seller-claimed-queries';

export function useSellerClaimedCondition(
  row: ReceivingLineRow,
  activeSerial: { id?: number | null; serial_number?: string | null } | null,
): SellerClaimedCondition {
  const orderId = useMemo(() => orderIdHintForSellerClaim(row), [row]);
  const serialUnitId =
    typeof activeSerial?.id === 'number' && activeSerial.id > 0
      ? activeSerial.id
      : null;
  const serial = String(activeSerial?.serial_number ?? '').trim() || null;
  const skuCatalogId =
    typeof row.sku_catalog_id === 'number' && row.sku_catalog_id > 0
      ? row.sku_catalog_id
      : null;

  const query = useQuery(
    sellerClaimedFactsQuery({
      serialUnitId,
      serial,
      skuCatalogId,
      orderId,
    }),
  );

  return useMemo(
    () =>
      resolveSellerClaimedCondition({
        matchedOrderCondition: query.data?.matchedOrderCondition ?? null,
        listingCondition: query.data?.listingCondition ?? null,
      }),
    [query.data?.matchedOrderCondition, query.data?.listingCondition],
  );
}
