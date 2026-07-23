'use client';

import { DeliveryStateIcon } from '@/components/station/ReceivingDeliveryStateIcon';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Incoming Status track — delivery_state icon (+ short Seller claim when needed).
 * Never render city / postal as cell text (that blew row height into an address
 * block). The icon's own tooltip carries the arriving claim.
 */
export function IncomingGridStatusCell({ row }: { row: ReceivingLineRow }) {
  const seller = row.tracking_confidence === 'seller_reported';

  if (!row.delivery_state && !seller) {
    return (
      <span className="text-text-faint" aria-hidden>
        —
      </span>
    );
  }

  return (
    <>
      <DeliveryStateIcon state={row.delivery_state} />
      {seller ? (
        <HoverTooltip label="Seller reported tracking — carrier has not confirmed yet">
          <span className="shrink-0 text-role-eyebrow font-semibold text-amber-700">Seller</span>
        </HoverTooltip>
      ) : null}
    </>
  );
}
