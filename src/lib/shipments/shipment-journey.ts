/**
 * The package record's JOURNEY RAIL (operator 2026-10-05): where did it go
 * wrong, and by how much. Six nodes, left → right —
 *
 *   Handed off · Carrier scan · Delivered · Check-in sent · Customer replied · Outcome
 *
 * Each reached node carries its instant and the gap from the previous REACHED
 * node; the node after the last reached one is the live node, its gap running
 * to now. A gap is `over` when it broke its threshold:
 *
 * - Carrier scan — the pickup window: 1 warehouse business day after hand-off
 *   (`addWarehouseBusinessDays`);
 * - Delivered — the longest carrier silence (between consecutive carrier
 *   events, and to now while undelivered) past {@link STALL_HOURS}, or
 *   delivery after the carrier's FIRST promise (whole PT days late);
 * - Check-in sent — sent after the check-in's `due_at`;
 * - Outcome — our answer to a customer reply past {@link REPLY_DUE_HOURS}.
 *
 * Thresholds are read through `journeyClockFace`, spans through
 * `formatJourneySpan`, so the rail and the Fulfilled clocks agree. Pure.
 */

import { REPLY_DUE_HOURS } from '@/lib/nav/fulfilled/journey';
import { formatJourneySpan, journeyClockFace } from '@/lib/nav/fulfilled/journey-clock';
import { addWarehouseBusinessDays } from '@/lib/shipping/carrier-pickup-window';
import { STALL_HOURS } from '@/lib/shipping/shipment-status';
import { diffDaysDateKey, toPSTDateKey } from '@/utils/date';
import type { ShipmentRecordJourney } from './shipment-record-types';

export const JOURNEY_NODE_KEYS = [
  'handed_off',
  'carrier_scan',
  'delivered',
  'check_in_sent',
  'customer_replied',
  'outcome',
] as const;
export type JourneyNodeKey = (typeof JOURNEY_NODE_KEYS)[number];

export type JourneyNodeState = 'done' | 'current' | 'pending';

/** How the order's check-in ended: resolved happy / with an issue / without an outcome, or closed for no response. */
export type JourneyOutcome = 'happy' | 'issue' | 'closed' | 'no_reply';

export const JOURNEY_NODE_LABEL: Readonly<Record<JourneyNodeKey, string>> = {
  handed_off: 'Handed off',
  carrier_scan: 'Carrier scan',
  delivered: 'Delivered',
  check_in_sent: 'Check-in sent',
  customer_replied: 'Customer replied',
  outcome: 'Outcome',
};

export const JOURNEY_OUTCOME_LABEL: Readonly<Record<JourneyOutcome, string>> = {
  happy: 'Happy',
  issue: 'Had an issue',
  closed: 'Closed',
  no_reply: 'No reply',
};

export interface JourneyGap {
  /** `+2d` — from the previous reached node to this one, or to now on the live node. */
  span: string;
  /** The live node's gap, still running to now. */
  running: boolean;
  /** The gap broke its threshold. */
  over: boolean;
  /** The threshold in words; null = this gap has none. */
  limit: string | null;
}

export interface JourneyNode {
  key: JourneyNodeKey;
  /** The node's name — the outcome's word once the check-in closed. */
  label: string;
  at: string | null;
  state: JourneyNodeState;
  gap: JourneyGap | null;
  /** Delivered: the carrier's FIRST promised delivery. */
  promisedAt: string | null;
  /** Delivered: `2d late` past the first promise (`late` while undelivered on the promised day). */
  late: string | null;
  /** Delivered: the longest carrier silence, when it broke {@link STALL_HOURS}. */
  silence: string | null;
  /** Check-in nodes on an order with no check-in projected. */
  noCheckIn: boolean;
  /** Outcome node: how the check-in ended; null until it closed (and on every other node). */
  outcome: JourneyOutcome | null;
}

const HOUR_MS = 3_600_000;
const CHECK_IN_KEYS: Readonly<Partial<Record<JourneyNodeKey, true>>> = { check_in_sent: true, customer_replied: true, outcome: true };

function outcomeOf(checkIn: ShipmentRecordJourney['checkIn']): JourneyOutcome | null {
  if (checkIn?.state === 'resolved') return checkIn.outcome ?? 'closed';
  if (checkIn?.state === 'no_response_closed') return 'no_reply';
  return null;
}

const ms = (at: string | null): number => (at ? Date.parse(at) : Number.NaN);
const iso = (epochMs: number): string => new Date(epochMs).toISOString();

/** The longest stretch with no carrier event, from the first scan through `endMs` (delivery, or now). */
function longestSilence(firstScanMs: number, carrierEventAts: readonly string[], endMs: number): { since: number; until: number } {
  const stamps = carrierEventAts
    .map((at) => Date.parse(at))
    .filter((at) => Number.isFinite(at) && at > firstScanMs && at < endMs)
    .sort((a, b) => a - b);
  const points = [firstScanMs, ...stamps, endMs];
  let longest = { since: firstScanMs, until: firstScanMs };
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]! - points[i - 1]! > longest.until - longest.since) longest = { since: points[i - 1]!, until: points[i]! };
  }
  return longest;
}

/**
 * The six nodes for one package as of `nowMs`. `carrierEventAts` = the
 * package's carrier event instants (any order) — the carrier-silence gaps.
 */
export function shipmentJourneyNodes(
  journey: ShipmentRecordJourney,
  carrierEventAts: readonly string[],
  nowMs: number,
): JourneyNode[] {
  const { checkIn } = journey;
  const hasCheckIn = checkIn !== null && checkIn.state !== 'not_applicable';
  const outcome = hasCheckIn ? outcomeOf(checkIn) : null;
  const reachedAt: Readonly<Record<JourneyNodeKey, string | null>> = {
    handed_off: journey.handOffAt,
    carrier_scan: journey.firstCarrierScanAt,
    delivered: journey.deliveredAt,
    check_in_sent: hasCheckIn ? checkIn.contactedAt : null,
    customer_replied: hasCheckIn ? checkIn.repliedAt : null,
    outcome: outcome ? (checkIn?.closedAt ?? null) : null,
  };

  const lastReached = JOURNEY_NODE_KEYS.findLastIndex((key) => reachedAt[key] !== null);
  // The live node follows the furthest stamp — none once the check-in closed, or when the
  // journey ends at delivery because the order has no check-in.
  const nextKey = JOURNEY_NODE_KEYS[lastReached + 1];
  const currentKey = nextKey && !(CHECK_IN_KEYS[nextKey] && !hasCheckIn) ? nextKey : null;

  return JOURNEY_NODE_KEYS.map((key, index) => {
    const at = reachedAt[key];
    const state: JourneyNodeState = at !== null ? 'done' : key === currentKey ? 'current' : 'pending';
    const node: JourneyNode = {
      key,
      label: key === 'outcome' && outcome ? JOURNEY_OUTCOME_LABEL[outcome] : JOURNEY_NODE_LABEL[key],
      at,
      state,
      gap: null,
      promisedAt: key === 'delivered' ? journey.promisedAt : null,
      late: null,
      silence: null,
      noCheckIn: CHECK_IN_KEYS[key] === true && !hasCheckIn,
      outcome: key === 'outcome' ? outcome : null,
    };
    if (state === 'pending') return node;

    const prevKey = JOURNEY_NODE_KEYS.slice(0, index).findLast((k) => reachedAt[k] !== null);
    const prevAt = prevKey ? reachedAt[prevKey] : null;
    const prevMs = ms(prevAt);
    const endMs = state === 'done' ? ms(at) : nowMs;
    if (!prevAt || !Number.isFinite(prevMs) || !Number.isFinite(endMs)) return node;

    let over = false;
    let limit: string | null = null;
    if (key === 'carrier_scan' && prevKey === 'handed_off') {
      limit = '1 business day to the first carrier scan';
      over = journeyClockFace({ since: prevAt, due: addWarehouseBusinessDays(new Date(prevMs)).toISOString() }, endMs)?.tone === 'over';
    } else if (key === 'delivered') {
      limit = `${STALL_HOURS}h carrier silence · the first promise`;
      const firstScanMs = ms(journey.firstCarrierScanAt);
      if (Number.isFinite(firstScanMs)) {
        const silence = longestSilence(firstScanMs, carrierEventAts, endMs);
        const face = journeyClockFace({ since: iso(silence.since), due: iso(silence.since + STALL_HOURS * HOUR_MS) }, silence.until);
        if (face?.tone === 'over') node.silence = face.age;
      }
      const promisedMs = ms(journey.promisedAt);
      if (journey.promisedAt && Number.isFinite(promisedMs) && endMs > promisedMs) {
        // Whole PT calendar days past the promised day (0 on the promised day).
        const days = diffDaysDateKey(toPSTDateKey(journey.promisedAt), toPSTDateKey(new Date(endMs))) ?? 0;
        // Delivered on the promised day is on time; undelivered past the promise is late now.
        if (days > 0) node.late = `${days}d late`;
        else if (state === 'current') node.late = 'late';
      }
      over = node.silence !== null || node.late !== null;
    } else if (key === 'check_in_sent' && checkIn?.dueAt) {
      limit = 'the check-in due date';
      over = journeyClockFace({ since: prevAt, due: checkIn.dueAt }, endMs)?.tone === 'over';
    } else if (key === 'outcome' && prevKey === 'customer_replied') {
      limit = `${REPLY_DUE_HOURS}h to answer the customer`;
      over = journeyClockFace({ since: prevAt, due: iso(prevMs + REPLY_DUE_HOURS * HOUR_MS) }, endMs)?.tone === 'over';
    }
    node.gap = { span: `+${formatJourneySpan(endMs - prevMs)}`, running: state === 'current', over, limit };
    return node;
  });
}
