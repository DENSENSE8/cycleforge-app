'use client';

/**
 * The order record's return reason — above Fulfillment on every order record
 * (Search, the desks, Unbox's Return order; operator 2026-10-09). Only the
 * reason: the rest of the record already says how the order left. Reads the
 * order timeline payload's `returns` (one key, no second request). The slot
 * is always there; with nothing filed it reads "No return reason", and fills
 * as returns land from the platforms (imports, reports, backfill).
 */

import { useQuery } from '@tanstack/react-query';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';

export function OrderReturnReason({ orderId }: { orderId: number }) {
  const { data: returns } = useQuery({ ...orderTimelineQuery(orderId), select: (payload) => payload.returns });
  // Hold the slot's height while the payload loads so the record never jumps.
  const filed = returns ?? [];
  return (
    <RecordGroup title="Return reason" testId="order-record-return-reason">
      <ul className="flex min-h-6 flex-col gap-1 px-4 pb-3" aria-busy={returns == null || undefined}>
        {returns == null ? null : filed.length === 0 ? (
          <li className="text-role-body italic text-text-muted" data-testid="order-record-return-reason-empty">
            No return reason
          </li>
        ) : (
          filed.map((entry) => {
            const reason = readReturnReason(entry.reason);
            return (
              <li key={entry.receivingLineId} className="text-role-body" data-testid="order-record-return-reason-item">
                {reason ? (
                  <>
                    <span className="font-semibold text-text-warning">{reason.label}</span>
                    {reason.code ? (
                      <span className="ml-2 font-mono text-role-caption text-text-muted" title="Code on the marketplace return report">
                        {reason.code}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="italic text-text-muted">No return reason</span>
                )}
              </li>
            );
          })
        )}
      </ul>
    </RecordGroup>
  );
}
