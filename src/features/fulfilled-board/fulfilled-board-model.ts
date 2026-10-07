/**
 * The Fulfilled board's numbers (Fulfillment › Fulfilled, operator
 * 2026-10-05), pure: every order in the window filed under its ONE bucket
 * (`entry.buckets[0]`, `FULFILLED_BUCKETS`), its clock face against the
 * viewer's now (`journeyClockFace`), most urgent first
 * (`compareJourneyUrgency`); and the headline that answers the desk's
 * questions at a glance. A column's count is the answer's own bucket count —
 * never the cards painted (a column paints at most
 * {@link FULFILLED_BOARD_CARD_CAP}).
 *
 * The board's columns are the carrier-facing seven
 * (`FULFILLED_BOARD_BUCKET_IDS`, operator 2026-10-06 R3); an order whose
 * bucket is a sidebar view (Returned, Late, …) or a check-in stage is not on
 * the board — it lives in that view, its record and the sheet.
 */

import { displayCarrierFromHint } from '@/lib/carrier-brand';
import type { NavFulfilledResponse, NavLocateBucket, NavLocateEntry, NavLocateFacts } from '@/lib/nav/context/schema';
import {
  compareJourneyUrgency,
  formatJourneySpan,
  journeyClockFace,
  type JourneyClockFace,
} from '@/lib/nav/fulfilled/journey-clock';
import {
  FULFILLED_BOARD_BUCKET_IDS,
  FULFILLED_BUCKET_SECTION,
  FULFILLED_BUCKETS,
  type FulfilledBucketId,
  type FulfilledSectionId,
} from '@/lib/nav/locate/bucket-precedence';
import type { FulfilledBoardDisplay } from '@/lib/outbound/fulfilled-params';
import { formatDateKeyShort, formatMonthDayTimePST, toPSTDateKey } from '@/utils/date';

/** Cards painted per column; the rest open in the sheet narrowed to the bucket. */
export const FULFILLED_BOARD_CARD_CAP = 60;

/** One-line definition of each bucket and its clock threshold — the column label's hover. */
export const FULFILLED_BUCKET_HINT: Readonly<Record<FulfilledBucketId, string>> = {
  exception: 'The carrier reported a delivery exception. Clock: since the exception, no limit.',
  returned: 'The carrier is returning it to us. Clock: since its latest event, no limit.',
  reply_due: 'The customer wrote and we owe the reply. Over 24h after their message.',
  no_movement: 'Handed off, never scanned by the carrier. Over the next warehouse business day.',
  stalled: 'Moving, then no carrier event for 72h.',
  late: 'Not delivered by the first promised date. Clock: since hand-off, over at the promise.',
  check_in_due: 'Delivered, and the customer check-in is due. Over at its due date.',
  tracking_stale: 'No successful carrier poll in 24h — the carrier is not being heard.',
  no_tracking: 'Shipped with no tracking number on file. Clock: since hand-off, no limit.',
  awaiting: 'Label made, waiting for the first carrier scan. Over the next warehouse business day.',
  in_transit: 'The carrier is moving it. Over after 72h without a new event.',
  out_for_delivery: 'Out for delivery. Over after 72h without a new event.',
  untracked: 'A carrier the house does not poll. Clock: since hand-off, no limit.',
  check_in_scheduled: 'Delivered; the check-in is not due yet. The clock runs to its due date.',
  checked_in: 'We checked in and wait on the customer. Over at the next follow-up.',
  happy: 'The customer said all is well. Closed.',
  issue: 'The check-in closed with an issue reported.',
  no_reply: 'The check-in closed without a customer reply.',
  closed: 'The check-in was resolved without an outcome.',
  delivered: 'Delivered, with no check-in for this order.',
};

export interface FulfilledBoardCard<E extends NavLocateEntry = NavLocateEntry> {
  entry: E;
  face: JourneyClockFace | null;
}

export interface FulfilledBoardColumn<E extends NavLocateEntry = NavLocateEntry> {
  id: FulfilledBucketId;
  label: string;
  tone: NavLocateBucket['tone'];
  section: FulfilledSectionId;
  /** The answer's count for the bucket (every filter but status). */
  count: number;
  /** Every order in the bucket, most urgent first. */
  cards: FulfilledBoardCard<E>[];
  /** Cards at or past their threshold. */
  over: number;
  /** The longest time in the bucket, null when no card carries a clock. */
  oldest: string | null;
}

/** One list per bucket in `ids` (default: the board's columns), each most urgent first, in {@link FULFILLED_BUCKETS} order. */
export function fulfilledBoardColumns<E extends NavLocateEntry>(
  entries: readonly E[],
  buckets: readonly NavLocateBucket[],
  now: number | null,
  ids: readonly FulfilledBucketId[] = FULFILLED_BOARD_BUCKET_IDS,
): FulfilledBoardColumn<E>[] {
  const byBucket = new Map<string, FulfilledBoardCard<E>[]>();
  for (const entry of entries) {
    const id = entry.buckets[0];
    if (!id || !ids.includes(id as FulfilledBucketId)) continue;
    const face = now == null ? null : journeyClockFace(entry.facts?.clock, now);
    const cards = byBucket.get(id);
    if (cards) cards.push({ entry, face });
    else byBucket.set(id, [{ entry, face }]);
  }
  const counts = new Map(buckets.map((bucket) => [bucket.id, bucket.count]));
  return FULFILLED_BUCKETS.filter((bucket) => ids.includes(bucket.id)).map((bucket) => {
    const cards = byBucket.get(bucket.id) ?? [];
    cards.sort((a, b) => compareJourneyUrgency(a.face, b.face));
    let over = 0;
    let oldestMs = -1;
    for (const card of cards) {
      if (card.face?.tone === 'over') over += 1;
      if (card.face && card.face.ageMs > oldestMs) oldestMs = card.face.ageMs;
    }
    return {
      id: bucket.id,
      label: bucket.label,
      tone: bucket.tone,
      section: FULFILLED_BUCKET_SECTION[bucket.id],
      count: counts.get(bucket.id) ?? cards.length,
      cards,
      over,
      oldest: oldestMs < 0 ? null : formatJourneySpan(oldestMs),
    };
  });
}

/** The column header's caption: `2 over · oldest 3d`; a column with no threshold says its oldest alone. */
export function fulfilledColumnMeta(column: Pick<FulfilledBoardColumn, 'cards' | 'over' | 'oldest'>): string {
  const limited = column.cards.some((card) => card.face?.limit != null);
  const parts = [limited ? `${column.over} over` : null, column.oldest ? `oldest ${column.oldest}` : null];
  return parts.filter(Boolean).join(' · ');
}

export interface FulfilledHeadlineFigures {
  /** Orders in the board's Act now columns (exact bucket counts). */
  actNow: number;
  /** Act now cards at or past their threshold. */
  actNowOver: number;
  stalled: number;
  noMovement: number;
  /** Orders in the window the carrier marked delivered (`facts.deliveredAt`). */
  delivered: number;
}

/** The board's first level of disclosure, read from its columns and the window's entries. */
export function fulfilledHeadline(columns: readonly FulfilledBoardColumn[], entries: readonly NavLocateEntry[]): FulfilledHeadlineFigures {
  const count = (id: FulfilledBucketId) => columns.find((column) => column.id === id)?.count ?? 0;
  let actNow = 0;
  let actNowOver = 0;
  for (const column of columns) {
    if (column.section !== 'act') continue;
    actNow += column.count;
    actNowOver += column.over;
  }
  return {
    actNow,
    actNowOver,
    stalled: count('stalled'),
    noMovement: count('no_movement'),
    delivered: entries.reduce((sum, entry) => sum + (entry.facts?.deliveredAt ? 1 : 0), 0),
  };
}

/** The columns the board paints under its sidebar display toggles: the Done section hidden on request. */
export function visibleBoardColumns<C extends Pick<FulfilledBoardColumn, 'section'>>(columns: readonly C[], display: Pick<FulfilledBoardDisplay, 'hideDone'>): C[] {
  return display.hideDone ? columns.filter((column) => column.section !== 'done') : [...columns];
}

/** The sub-header of cards whose package names no carrier. */
export const NO_CARRIER_GROUP = 'No carrier';
const CARRIER_GROUP_ORDER = ['UPS', 'FedEx', 'USPS'];

export interface FulfilledCarrierGroup<E extends NavLocateEntry = NavLocateEntry> {
  /** `UPS` · `FedEx` · `USPS` · another carrier's name · {@link NO_CARRIER_GROUP}. */
  carrier: string;
  cards: FulfilledBoardCard<E>[];
}

/**
 * A column's cards under carrier sub-headers (the sidebar's Group by ›
 * Carrier): UPS, FedEx, USPS first, then any other carrier A to Z, then
 * {@link NO_CARRIER_GROUP}; each group keeps the column's urgency order.
 */
export function groupCardsByCarrier<E extends NavLocateEntry>(cards: readonly FulfilledBoardCard<E>[]): FulfilledCarrierGroup<E>[] {
  const groups = new Map<string, FulfilledBoardCard<E>[]>();
  for (const card of cards) {
    const hint = card.entry.facts?.carrier ?? null;
    const carrier = displayCarrierFromHint(hint) ?? (hint?.trim() || NO_CARRIER_GROUP);
    const list = groups.get(carrier);
    if (list) list.push(card);
    else groups.set(carrier, [card]);
  }
  const rank = (carrier: string) => {
    const known = CARRIER_GROUP_ORDER.indexOf(carrier);
    return known >= 0 ? known : carrier === NO_CARRIER_GROUP ? CARRIER_GROUP_ORDER.length + 1 : CARRIER_GROUP_ORDER.length;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([carrier, list]) => ({ carrier, cards: list }));
}

/**
 * The card's live carrier line, so nobody opens UPS / FedEx to know where a
 * package is: the latest event in plain words · where · when (PT), then
 * `ETA Oct 9` while it travels — or, once delivered, `Delivered Oct 7, 2:10 PM`
 * · where. Null when the carrier has said nothing yet.
 */
export function journeyCarrierLine(
  facts: Pick<NavLocateFacts, 'deliveredAt' | 'lastEvent' | 'lastEventPlace' | 'eta'> | null | undefined,
): string | null {
  if (!facts) return null;
  const place = facts.lastEventPlace ?? null;
  if (facts.deliveredAt) return [`Delivered ${formatMonthDayTimePST(facts.deliveredAt)}`, place].filter(Boolean).join(' · ');
  const event = facts.lastEvent ?? null;
  const said = event?.status ?? event?.label ?? null;
  const parts = [said, place, event?.at ? formatMonthDayTimePST(event.at) : null];
  const etaKey = facts.eta ? toPSTDateKey(facts.eta) : '';
  if (etaKey) parts.push(`ETA ${formatDateKeyShort(etaKey)}`);
  const line = parts.filter(Boolean).join(' · ');
  return line || null;
}

/** `just now` · `12m ago` · `3h ago` · `2d ago`. */
function agoText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export interface JourneyFreshness {
  /** `Checked 3h ago`; `Never checked` when the carrier was never polled successfully. */
  text: string;
  /** The last poll's error (the card's `sync failing` hover), null when the last poll answered. */
  error: string | null;
}

/** How fresh the card's carrier status is (`facts.lastPoll`); null when the package is not polled (Untracked, no tracking). */
export function journeyFreshness(facts: Pick<NavLocateFacts, 'lastPoll'> | null | undefined, now: number | null): JourneyFreshness | null {
  const poll = facts?.lastPoll ?? null;
  if (!poll) return null;
  const at = poll.at ? Date.parse(poll.at) : Number.NaN;
  const text = Number.isFinite(at) ? (now == null ? 'Checked' : `Checked ${agoText(now - at)}`) : 'Never checked';
  return { text, error: poll.error ?? null };
}

type SyncHealth = NonNullable<NavFulfilledResponse['syncHealth']>;

/**
 * The board headline's one quiet warning, only when true: each enabled
 * carrier with a config fault or failing open rows, since its last good poll
 * — `UPS sync failing since Oct 5, 2:31 PM — statuses may be behind`.
 */
export function fulfilledSyncWarning(health: SyncHealth | null | undefined): string | null {
  const failing = (health?.carriers ?? []).filter((row) => row.enabled && (row.configFault || row.failingOpen > 0));
  if (failing.length === 0) return null;
  const said = failing.map((row) => {
    const name = displayCarrierFromHint(row.carrier) ?? row.carrier;
    return row.lastOkAt ? `${name} sync failing since ${formatMonthDayTimePST(row.lastOkAt)}` : `${name} sync failing`;
  });
  return `${said.join(' · ')} — statuses may be behind`;
}
