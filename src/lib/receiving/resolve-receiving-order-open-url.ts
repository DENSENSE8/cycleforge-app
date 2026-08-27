/**
 * Resolve the Unbox History ORDER-column Open target: product/listing URL
 * first, then marketplace order page. Never invents a Google search.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { normalizeListingHref } from '@/lib/receiving/listing-links';
import { marketplaceOrderUrl } from '@/utils/order-platform';

export function resolveReceivingOrderOpenUrl(
  row: Pick<
    ReceivingLineRow,
    | 'receiving_listing_url'
    | 'source_order_id'
    | 'source_platform'
    | 'inbound_source_type'
  >,
  poValue: string,
): string | null {
  const listing = normalizeListingHref(row.receiving_listing_url);
  if (listing) return listing;

  const orderId = (row.source_order_id || poValue || '').trim();
  if (!orderId) return null;
  const channel = row.source_platform || row.inbound_source_type || null;
  return marketplaceOrderUrl(orderId, channel);
}
