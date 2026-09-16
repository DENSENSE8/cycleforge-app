/**
 * The ONE way to build {@link OutboundSignals} from a row.
 *
 * `OutboundSignals.stalled` is optional, and every surface that hand-built the
 * bag forgot it differently. That is not a style problem — it is how one row
 * paints two contradicting answers:
 *
 * - the STATUS chip (`deriveShippedRecord`) passed `stalled`, so an 11-day-old
 *   `IN_TRANSIT` row resolved to `EXCEPTION` and painted the red pill;
 * - the NEXT-STEP line (`ordersNextStep`) did NOT, so the same row resolved to
 *   `IN_CUSTODY` and promised `→ Out for delivery` under the exception.
 *
 * So the stall rule is not a caller's job any more. Build the bag here, and a
 * surface cannot disagree with its own row. `now` is injectable so the rule is
 * testable without freezing the clock.
 */

import type { OutboundSignals } from '@/lib/order-lifecycle';
import { isStalled } from '@/lib/shipping/shipment-status';

/** Wire facts every outbound row carries, whatever feed shaped it. */
export interface OutboundSignalFacts {
  /** Pack instant — the caller picks its own ladder (`packed_at`, pack activity, packer-log `created_at`). */
  packedAt?: string | null;
  shipConfirmedAt?: string | null;
  latestStatusCategory?: string | null;
  /** Last carrier scan — the input the stall rule reads. */
  latestEventAt?: string | null;
  isTerminal?: boolean | null;
  hasException?: boolean | null;
  /** Hours without a carrier scan before a live shipment counts as stalled. */
  stallHours?: number;
  now?: number;
}

export function outboundSignals(facts: OutboundSignalFacts): OutboundSignals {
  return {
    packedAt: facts.packedAt ?? null,
    shipConfirmedAt: facts.shipConfirmedAt ?? null,
    latestStatusCategory: facts.latestStatusCategory ?? null,
    isTerminal: facts.isTerminal ?? null,
    hasException: facts.hasException ?? null,
    stalled: isStalled({
      isTerminal: facts.isTerminal ?? null,
      category: facts.latestStatusCategory ?? null,
      latestEventAt: facts.latestEventAt ?? null,
      stallHours: facts.stallHours,
      now: facts.now,
    }),
  };
}
