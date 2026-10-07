/**
 * ONE status per pasted number (operator 2026-10-04). A number can sit in
 * several buckets — not received AND an exception, awaiting tracking AND not
 * received — and filters keep that membership (it counts under each chip),
 * but every surface PAINTS one identifier: the most specific, by the
 * precedence declared here once per locator, over that locator's own ids.
 *
 * - inbound: exceptions › awaiting tracking › not received › received;
 * - outbound: exceptions, then the desk's own view order;
 * - support: the local statuses in chip order (live work before resolved).
 *
 * Across sections the page's own section leads (the list on screen), then
 * the precedence, then the answer's order.
 */

import type { NavLocateBucket, NavLocateScope, NavLocator } from '@/lib/nav/context/schema';
import { INBOUND_BUCKET_IDS } from '@/lib/nav/locate/inbound';
import { OUTBOUND_LOCATE_STATUSES } from '@/lib/nav/locate/outbound-params';
import { SUPPORT_LOCATE_STATUSES } from '@/lib/nav/locate/support-params';
import { CARRIER_STATUS } from '@/lib/status/record-status';

type InboundBucketId = (typeof INBOUND_BUCKET_IDS)[number];

const INBOUND_PRECEDENCE = [
  'exceptions',
  'awaiting_tracking',
  'not_received',
  'received',
] as const satisfies readonly InboundBucketId[];

/** Most specific first, per locator — every id the locator answers with appears once. */
export const LOCATE_BUCKET_PRECEDENCE: Readonly<Record<NavLocator, readonly string[]>> = {
  inbound: INBOUND_PRECEDENCE,
  outbound: ['exceptions', ...OUTBOUND_LOCATE_STATUSES.filter((id) => id !== 'exceptions')],
  support: SUPPORT_LOCATE_STATUSES,
};

/**
 * Fulfillment › Fulfilled (`GET /api/nav/fulfilled`): where a shipped order
 * is on its JOURNEY — carrier half (did it reach the customer?) then the
 * customer half (did we check in, did they answer, how did it end). ONE id
 * per row, first match wins in this order (carrier predicates
 * `src/lib/nav/fulfilled/bucket.ts`, customer stages `./journey.ts`). Every
 * declared bucket is answered, zero counts included.
 *
 * `section` is the urgency band the board groups columns under (operator
 * 2026-10-05): `act` = past or at a threshold, a verb is owed now; `watch` =
 * moving inside its threshold; `done` = nothing owed. Order inside a section
 * is the board's column order.
 *
 * `place` is where the desk paints the bucket (operator 2026-10-06,
 * `HANDOFF-fulfilled-drilldown.md` R3–R5): `board` = a board column (the
 * carrier-facing seven); `view` = a left-sidebar view of its own; `record` =
 * neither — the status still files the order, reads on its record and filters
 * the sheet's status chips.
 *
 * These are support follow-up buckets, not record statuses: the carrier
 * buckets that ARE a carrier status (Exception, Returned, In transit, Out for
 * delivery, Delivered) wear its word from `CARRIER_STATUS`
 * (`src/lib/status/record-status.ts`); the rest are journey verdicts.
 */
export const FULFILLED_SECTIONS = [
  { id: 'act', label: 'Act now' },
  { id: 'watch', label: 'Watch' },
  { id: 'done', label: 'Done' },
] as const;
export type FulfilledSectionId = (typeof FULFILLED_SECTIONS)[number]['id'];
export type FulfilledBucketPlace = 'board' | 'view' | 'record';

export const FULFILLED_BUCKETS = [
  // ── Act now ──
  { id: 'exception', label: CARRIER_STATUS.exception.label, tone: 'danger', section: 'act', place: 'board' },
  { id: 'returned', label: CARRIER_STATUS.returned.label, tone: 'warning', section: 'act', place: 'view' },
  { id: 'reply_due', label: 'Reply due', tone: 'danger', section: 'act', place: 'view' },
  { id: 'no_movement', label: 'No movement', tone: 'danger', section: 'act', place: 'board' },
  { id: 'stalled', label: 'Stalled', tone: 'warning', section: 'act', place: 'board' },
  { id: 'late', label: 'Late', tone: 'warning', section: 'act', place: 'view' },
  { id: 'check_in_due', label: 'Check-in due', tone: 'warning', section: 'act', place: 'record' },
  { id: 'tracking_stale', label: 'Tracking stale', tone: 'warning', section: 'act', place: 'board' },
  { id: 'no_tracking', label: 'No tracking', tone: 'warning', section: 'act', place: 'view' },
  // ── Watch ──
  { id: 'awaiting', label: 'Awaiting pickup', tone: 'neutral', section: 'watch', place: 'view' },
  { id: 'in_transit', label: CARRIER_STATUS.in_transit.label, tone: 'info', section: 'watch', place: 'board' },
  { id: 'out_for_delivery', label: CARRIER_STATUS.out_for_delivery.label, tone: 'info', section: 'watch', place: 'board' },
  { id: 'untracked', label: 'Untracked', tone: 'neutral', section: 'watch', place: 'view' },
  { id: 'check_in_scheduled', label: 'Check-in scheduled', tone: 'info', section: 'watch', place: 'record' },
  { id: 'checked_in', label: 'Checked in', tone: 'info', section: 'watch', place: 'record' },
  // ── Done ──
  { id: 'happy', label: 'Happy', tone: 'success', section: 'done', place: 'record' },
  { id: 'issue', label: 'Had an issue', tone: 'warning', section: 'done', place: 'record' },
  { id: 'no_reply', label: 'No reply', tone: 'neutral', section: 'done', place: 'record' },
  { id: 'closed', label: 'Closed', tone: 'neutral', section: 'done', place: 'record' },
  { id: 'delivered', label: CARRIER_STATUS.delivered.label, tone: 'success', section: 'done', place: 'board' },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  tone: NavLocateBucket['tone'];
  section: FulfilledSectionId;
  place: FulfilledBucketPlace;
}>;
export type FulfilledBucketId = (typeof FULFILLED_BUCKETS)[number]['id'];
export const FULFILLED_BUCKET_IDS = FULFILLED_BUCKETS.map((bucket) => bucket.id) as readonly FulfilledBucketId[];

/** Each bucket's urgency band. */
export const FULFILLED_BUCKET_SECTION: Readonly<Record<FulfilledBucketId, FulfilledSectionId>> = Object.fromEntries(
  FULFILLED_BUCKETS.map((bucket) => [bucket.id, bucket.section]),
) as Record<FulfilledBucketId, FulfilledSectionId>;

type BucketIn<P extends FulfilledBucketPlace> = Extract<(typeof FULFILLED_BUCKETS)[number], { place: P }>['id'];
export type FulfilledBoardBucketId = BucketIn<'board'>;
export type FulfilledViewBucketId = BucketIn<'view'>;

/** The board's columns, in column order (R3). */
export const FULFILLED_BOARD_BUCKET_IDS = FULFILLED_BUCKETS.filter((bucket) => bucket.place === 'board').map(
  (bucket) => bucket.id,
) as readonly FulfilledBoardBucketId[];
/** The sidebar's views beside the board, in sidebar order (R4). */
export const FULFILLED_VIEW_BUCKET_IDS = FULFILLED_BUCKETS.filter((bucket) => bucket.place === 'view').map(
  (bucket) => bucket.id,
) as readonly FulfilledViewBucketId[];

/** The first of `ids` in {@link FULFILLED_BUCKETS} precedence (an order's packages → its one bucket). */
export function fulfilledPrimaryBucket(ids: readonly FulfilledBucketId[]): FulfilledBucketId | null {
  let best = -1;
  for (const id of ids) {
    const rank = FULFILLED_BUCKET_IDS.indexOf(id);
    if (rank >= 0 && (best < 0 || rank < best)) best = rank;
  }
  return best < 0 ? null : FULFILLED_BUCKET_IDS[best];
}

/** `inbound:received` → inbound / received; a bare id belongs to the scope's own locator. */
function sectionOf(id: string, scope: NavLocateScope): { locator: NavLocator | null; own: string; elsewhere: boolean } {
  const at = id.indexOf(':');
  if (at > 0) return { locator: id.slice(0, at) as NavLocator, own: id.slice(at + 1), elsewhere: true };
  return { locator: scope === 'everywhere' ? null : scope, own: id, elsewhere: false };
}

/** The ONE bucket id a number is painted with, or null when it is found nowhere. */
export function primaryBucketId(bucketIds: readonly string[], scope: NavLocateScope): string | null {
  let best: { id: string; elsewhere: boolean; rank: number } | null = null;
  for (const id of bucketIds) {
    const { locator, own, elsewhere } = sectionOf(id, scope);
    const order = locator ? LOCATE_BUCKET_PRECEDENCE[locator] : undefined;
    const at = order ? order.indexOf(own) : -1;
    const rank = at < 0 ? Number.MAX_SAFE_INTEGER : at;
    if (!best || (best.elsewhere && !elsewhere) || (best.elsewhere === elsewhere && rank < best.rank)) {
      best = { id, elsewhere, rank };
    }
  }
  return best?.id ?? null;
}
