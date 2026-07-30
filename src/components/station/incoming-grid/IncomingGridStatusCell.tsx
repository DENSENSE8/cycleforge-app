'use client';

import { DeliveryStateIcon } from '@/components/station/ReceivingDeliveryStateIcon';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { claimCountdownFace } from '@/lib/receiving/claim-window';
import { getCurrentPSTDateKey } from '@/utils/date';

const DWELL_LABEL = '48h+';
const DWELL_TIP =
  'Delivered more than 48 hours ago and still not unboxed — past the dock-to-stock target';

/**
 * Incoming Status track — delivery_state icon (+ a short Seller claim when needed,
 * + ONE deadline token on the delivered-not-unboxed lane).
 *
 * Never render city / postal as cell text (that blew row height into an address
 * block). The same discipline bounds what was added here: **this track is 75px
 * wide with `overflow: visible`**, measured in the real grid — so a second token
 * beside `48h+` puts ~144px of content in it and spills over the ORDER column
 * instead of clipping. Two competing numbers in 75px are not scannable anyway.
 *
 * So the two clocks share ONE slot, ranked by urgency:
 *   1. an eBay claim that is due or already expired — an EXTERNAL deadline that
 *      takes the money with it, so it outranks everything,
 *   2. a 48h+ dwell breach — INTERNAL, recoverable,
 *   3. a claim still comfortably out — shown quietly, since nothing else competes.
 * Whichever wins, the tooltip carries BOTH facts, so nothing is lost.
 */
export function IncomingGridStatusCell({ row }: { row: ReceivingLineRow }) {
  const seller = row.tracking_confidence === 'seller_reported';
  // The EXTERNAL clock: only eBay-sourced rows carry a claim deadline, so this is
  // absent on every vendor PO by construction (see delivered-not-unboxed.ts).
  const claim = row.claim_by_date
    ? claimCountdownFace(row.claim_by_date, getCurrentPSTDateKey())
    : null;
  // The INTERNAL clock: dwell past the 48h dock-to-stock SLA. Shown only in breach —
  // a marker on every row would be ink with no decision attached.
  const staleDwell = row.delivered_age_band === 'gt_48h';

  const claimWins = claim != null && (claim.urgency === 'expired' || claim.urgency === 'due');
  const deadline = claimWins
    ? { label: claim.label, tone: claim.tone, tip: staleDwell ? `${claim.description} Also: ${DWELL_TIP}.` : claim.description }
    : staleDwell
      ? { label: DWELL_LABEL, tone: 'text-amber-700', tip: claim ? `${DWELL_TIP}. Also: ${claim.description}` : DWELL_TIP }
      : claim
        ? { label: claim.label, tone: claim.tone, tip: claim.description }
        : null;

  if (!row.delivery_state && !seller && !deadline) {
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
          <span className="shrink-0 text-role-eyebrow text-amber-700">Seller</span>
        </HoverTooltip>
      ) : null}
      {deadline ? (
        <HoverTooltip label={deadline.tip}>
          <span className={`shrink-0 text-role-eyebrow ${deadline.tone}`}>{deadline.label}</span>
        </HoverTooltip>
      ) : null}
    </>
  );
}
