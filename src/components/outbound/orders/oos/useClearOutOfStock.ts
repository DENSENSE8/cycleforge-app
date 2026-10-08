'use client';

/**
 * Mark not out of stock — the ONE clear for an order's shortage, shared by the
 * record's Out of stock notice and the order verbs (Clear out of stock). Undo
 * re-reports each order with the shortage it carried before the clear.
 */

import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import { morphingListingIdentity, morphingOosAssignPayload, type MorphingOosRow } from '@/lib/outbound/morphing-oos';
import { shortageIdentityFromRow, type OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export function useClearOutOfStock(): (rows: readonly ShippedOrder[]) => void {
  const assign = useOrderAssignment();
  return (rows) => {
    const short = rows.filter((row) => Boolean(row.is_out_of_stock));
    const orderIds = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (orderIds.length === 0) return;
    const cleared = short
      .map((row) => ({
        id: Number(row.id),
        identity: shortageIdentityFromRow(row) ?? morphingListingIdentity(row as MorphingOosRow),
      }))
      .filter((entry): entry is { id: number; identity: OrderShortageIdentity } => Number.isFinite(entry.id));
    assign.mutate(
      { orderIds, isOutOfStock: false },
      {
        onSuccess: () =>
          toast.undo(orderIds.length === 1 ? 'Marked not out of stock' : `${orderIds.length} orders marked not out of stock`, {
            onUndo: () => {
              for (const entry of cleared) {
                assign.mutate(morphingOosAssignPayload([entry.id], entry.identity), {
                  onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not undo the clear'),
                });
              }
            },
          }),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not clear out of stock'),
      },
    );
  };
}
