'use client';

import { IncomingTrackingStatusCluster } from '@/components/station/ReceivingDeliveryStateIcon';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { claimCountdownFace } from '@/lib/receiving/claim-window';
import { getCurrentPSTDateKey } from '@/utils/date';

const DWELL_LABEL = '48h+';
const DWELL_TIP = 'Delivered 48h+ — still not unboxed';

/**
 * Incoming Status track — delivery_state icon (+ Unv. when it adds signal,
 * + ONE deadline token on the delivered-not-unboxed lane).
 *
 * Never render city / postal as cell text (that blew row height into an address
 * block). Cells clip at the track edge via {@link ordersQueueGridCell} — keep
 * labels short (`Unv.`); full meaning lives in the tooltip. A second token
 * beside `48h+` still must not compete in 75px — two clocks in one narrow track
 * are not scannable anyway.
 *
 * So the two clocks share ONE slot, ranked by urgency:
 *   1. an eBay claim that is due or already expired — an EXTERNAL deadline that
 *      takes the money with it, so it outranks everything,
 *   2. a 48h+ dwell breach — INTERNAL, recoverable,
 *   3. a claim still comfortably out — shown quietly, since nothing else competes.
 * Whichever wins, the tooltip carries BOTH facts, so nothing is lost.
 *
 * Never route expected-phase status through {@link ReceivingStatusCell} —
 * that cell is landed workflow/lifecycle, not carrier delivery_state.
 */
export function ReceivingDeliveryStatusCell({ row }: { row: ReceivingLineRow }) {
  const unverified = row.tracking_confidence === 'seller_reported';
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
    ? { label: claim.label, tone: claim.tone, tip: staleDwell ? `${claim.tip} · ${DWELL_TIP}` : claim.tip }
    : staleDwell
      ? { label: DWELL_LABEL, tone: 'text-amber-700', tip: claim ? `${DWELL_TIP} · ${claim.tip}` : DWELL_TIP }
      : claim
        ? { label: claim.label, tone: claim.tone, tip: claim.tip }
        : null;

  if (!row.delivery_state && !unverified && !deadline) {
    return (
      <span className="text-text-faint" aria-hidden>
        —
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <IncomingTrackingStatusCluster
        deliveryState={row.delivery_state}
        sellerReported={unverified}
      />
      {deadline ? (
        <HoverTooltip label={deadline.tip}>
          <span className={`shrink-0 text-role-eyebrow ${deadline.tone}`}>{deadline.label}</span>
        </HoverTooltip>
      ) : null}
    </span>
  );
}
