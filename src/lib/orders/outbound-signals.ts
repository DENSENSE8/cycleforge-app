/** The ONE way to build {@link OutboundSignals} from a row. */

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
