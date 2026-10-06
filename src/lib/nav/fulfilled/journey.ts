/**
 * The order's JOURNEY stage and clock (operator 2026-10-05). The carrier half
 * (`./bucket.ts`, one bucket per order from its packages) is joined with the
 * customer half — the order's post-purchase check-in (`order_support_follow_ups`):
 *
 * - a DELIVERED order is painted with its check-in stage instead
 *   ({@link checkInStage}); no check-in / not applicable stays Delivered;
 * - a NOT-delivered order whose check-in already wants us (`due`,
 *   `follow_up_due`, `staff_reply_due` — the shipped fallback, or a customer
 *   writing "where is my package") competes with its carrier bucket by
 *   `FULFILLED_BUCKETS` precedence.
 *
 * The clock is when the row's bucket started (`since`) and when it breaches
 * that bucket's threshold (`due`, null = none), server-computed instants the
 * client paints through `journeyClockFace`. Pure.
 */

import { fulfilledPrimaryBucket, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import { POLL_STALE_HOURS, trackingFreshSince } from '@/lib/nav/fulfilled/bucket';
import type { JourneyClock } from '@/lib/nav/fulfilled/journey-clock';
import type { FulfilledCheckInRow, FulfilledPackageRow } from '@/lib/nav/fulfilled/sql';
import { addWarehouseBusinessDays } from '@/lib/shipping/carrier-pickup-window';
import { STALL_HOURS } from '@/lib/shipping/shipment-status';
import type { OrderCheckInState } from '@/lib/support/conversation/model';

/** Hours a customer's reply may wait for ours before Reply due is over its threshold. */
export const REPLY_DUE_HOURS = 24;

const HOUR_MS = 3_600_000;

/** Each open / closed check-in state's stage (`resolved` splits by its outcome). */
const CHECK_IN_STAGE: Readonly<Record<Exclude<OrderCheckInState, 'resolved'>, FulfilledBucketId>> = {
  not_applicable: 'delivered',
  not_due: 'check_in_scheduled',
  due: 'check_in_due',
  follow_up_due: 'check_in_due',
  staff_reply_due: 'reply_due',
  contacted: 'checked_in',
  waiting_customer: 'checked_in',
  customer_replied: 'checked_in',
  no_response_closed: 'no_reply',
};

/** Check-in states that want us before the carrier says delivered. */
const OWED_BEFORE_DELIVERY: Readonly<Partial<Record<OrderCheckInState, true>>> = {
  due: true,
  follow_up_due: true,
  staff_reply_due: true,
};

/** A delivered order's stage from its check-in (none = Delivered). */
export function checkInStage(checkIn: Pick<FulfilledCheckInRow, 'state' | 'outcome'> | null): FulfilledBucketId {
  if (checkIn === null) return 'delivered';
  if (checkIn.state === 'resolved') return checkIn.outcome ?? 'closed';
  return CHECK_IN_STAGE[checkIn.state];
}

/** The order's one journey stage from its carrier bucket and its check-in. */
export function journeyStage(
  carrierBucket: FulfilledBucketId,
  checkIn: Pick<FulfilledCheckInRow, 'state' | 'outcome'> | null,
): FulfilledBucketId {
  if (carrierBucket === 'delivered') return checkInStage(checkIn);
  if (checkIn !== null && OWED_BEFORE_DELIVERY[checkIn.state]) {
    return fulfilledPrimaryBucket([carrierBucket, checkInStage(checkIn)]) ?? carrierBucket;
  }
  return carrierBucket;
}

/** What the clock reads: the package the row's carrier bucket speaks for, the order's delivery and its check-in. */
export interface JourneyClockFacts {
  lead: Pick<FulfilledPackageRow, 'handOffAt' | 'latestEventAt' | 'lastCheckedAt' | 'exceptionAt' | 'promisedAt'> | null;
  deliveredAt: string | null;
  checkIn: FulfilledCheckInRow | null;
}

const hoursAfter = (since: string, hours: number): string | null => {
  const ms = Date.parse(since);
  return Number.isFinite(ms) ? new Date(ms + hours * HOUR_MS).toISOString() : null;
};

/** The bucket's clock — when it started and when it breaches its threshold; null when nothing says when it started. */
export function journeyClock(bucket: FulfilledBucketId, facts: JourneyClockFacts): JourneyClock | null {
  const { lead, checkIn } = facts;
  const handOff = lead?.handOffAt ?? null;
  let since: string | null;
  let due: string | null = null;
  switch (bucket) {
    case 'awaiting':
    case 'no_movement': {
      since = handOff;
      const handOffMs = handOff ? Date.parse(handOff) : Number.NaN;
      due = Number.isFinite(handOffMs) ? addWarehouseBusinessDays(new Date(handOffMs)).toISOString() : null;
      break;
    }
    case 'in_transit':
    case 'out_for_delivery':
    case 'stalled':
      since = lead?.latestEventAt ?? null;
      due = since ? hoursAfter(since, STALL_HOURS) : null;
      break;
    case 'late':
      since = handOff;
      due = lead?.promisedAt ?? null;
      break;
    case 'tracking_stale':
      since = lead ? trackingFreshSince(lead) : null;
      due = since ? hoursAfter(since, POLL_STALE_HOURS) : null;
      break;
    case 'exception':
      since = lead?.exceptionAt ?? lead?.latestEventAt ?? null;
      break;
    case 'returned':
      since = lead?.latestEventAt ?? null;
      break;
    case 'no_tracking':
    case 'untracked':
      since = handOff;
      break;
    case 'check_in_scheduled':
    case 'check_in_due':
      // A follow-up is due off the last contact; a first check-in off its trigger (the delivery).
      if (checkIn?.state === 'follow_up_due') {
        since = checkIn.contactedAt;
        due = checkIn.nextFollowUpAt;
      } else {
        since = checkIn?.triggerAt ?? null;
        due = checkIn?.dueAt ?? null;
      }
      break;
    case 'checked_in':
      since = checkIn?.contactedAt ?? null;
      due = checkIn?.nextFollowUpAt ?? null;
      break;
    case 'reply_due':
      since = checkIn?.repliedAt ?? null;
      due = since ? hoursAfter(since, REPLY_DUE_HOURS) : null;
      break;
    case 'happy':
    case 'issue':
    case 'closed':
    case 'no_reply':
      since = checkIn?.closedAt ?? null;
      break;
    case 'delivered':
      since = facts.deliveredAt;
      break;
    default: {
      const unknown: never = bucket;
      throw new Error(`journey clock: unknown bucket ${String(unknown)}`);
    }
  }
  return since ? { since, due } : null;
}
