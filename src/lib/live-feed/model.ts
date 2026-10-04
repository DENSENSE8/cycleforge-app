/**
 * The Live feed's pure rules — the window, the lens date rule, carried-over,
 * the list order and the Copy all list. Shared by the SQL builder, the loader
 * and the tests; no IO here.
 */

import { shippedTimeWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { addDaysToDateKey, diffDaysDateKey } from '@/utils/date';
import type { LiveFeedLens, LiveFeedStatusKind } from '@/lib/live-feed/statuses';
import type { LiveFeedFilters, LiveFeedItem, LiveFeedUrgency } from '@/lib/live-feed/types';

type LiveFeedRange = Pick<LiveFeedFilters, 'from' | 'to' | 'timeFrom' | 'timeTo'>;

/** The instants the date rule binds (warehouse zone, DST-exact). */
export interface LiveFeedWindow {
  /** `from` at `timeFrom` (else its first instant). */
  fromIso: string;
  /** `to` at `timeTo` + 1 minute (else the day after `to`) — exclusive. */
  toIso: string;
}

/** The range's window — the same arithmetic as the Fulfilled date + time filter (`shippedTimeWindow`). */
export function liveFeedWindow(range: LiveFeedRange): LiveFeedWindow {
  const timed = shippedTimeWindow({
    dateFrom: range.from,
    dateTo: range.to,
    ...(range.timeFrom ? { timeFrom: range.timeFrom } : {}),
    ...(range.timeTo ? { timeTo: range.timeTo } : {}),
  });
  if (!timed) throw new Error(`invalid live feed range: ${range.from}..${range.to}`);
  return { fromIso: timed.fromIso, toIso: timed.toIso };
}

/**
 * The previous period of equal length — `from..to` shifted back by its own
 * day count, same times of day (Sep 30 → Sep 29; Sep 24–30 → Sep 17–23):
 * what a done lane's `previousCount` reads.
 */
export function liveFeedPreviousRange(range: LiveFeedRange): LiveFeedRange {
  const days = (diffDaysDateKey(range.from, range.to) ?? 0) + 1;
  return { ...range, from: addDaysToDateKey(range.from, -days), to: addDaysToDateKey(range.to, -days) };
}

/** The membership column each lens reads (`at` = the instant the package entered its current lane). */
export const LIVE_FEED_LENS_COLUMN: Readonly<Record<LiveFeedLens, string>> = {
  entered: 'at',
  packed: 'packed_at',
  scanned_out: 'scanned_out_at',
  delivered: 'delivered_at',
  received: 'received_at',
  unboxed: 'unboxed_at',
};

/** Open lanes under lens `entered` keep what entered them before `from` — counted as carried over. */
export function liveFeedCarries(kind: LiveFeedStatusKind, lens: LiveFeedLens): boolean {
  return kind === 'open' && lens === 'entered';
}

interface WindowRefs {
  fromRef: string;
  toRef: string;
}

/**
 * The membership bound over alias `a`: the lens instant inside the window;
 * on a carrying lane (open, lens `entered`) only before the window's end, so
 * the carried-over rows stay readable ({@link liveFeedListedSql},
 * {@link liveFeedCarriedSql}).
 */
export function liveFeedDateRuleSql(kind: LiveFeedStatusKind, lens: LiveFeedLens, a: string, refs: WindowRefs): string {
  const col = `${a}.${LIVE_FEED_LENS_COLUMN[lens]}`;
  if (liveFeedCarries(kind, lens)) return `(${col} < ${refs.toRef}::timestamptz)`;
  return `(${col} >= ${refs.fromRef}::timestamptz AND ${col} < ${refs.toRef}::timestamptz)`;
}

/** Rows of a bounded membership that entered before the window and are still known to sit there (`carries`). */
export function liveFeedCarriedSql(a: string, refs: WindowRefs): string {
  return `(${a}.at < ${refs.fromRef}::timestamptz AND COALESCE(${a}.carries, true))`;
}

/**
 * The listed rows of a bounded membership over alias `a`: on a carrying lane
 * those inside the window, plus the carried-over ones with `carry`; else
 * every bounded row.
 */
export function liveFeedListedSql(kind: LiveFeedStatusKind, lens: LiveFeedLens, carry: boolean, a: string, refs: WindowRefs): string {
  if (!liveFeedCarries(kind, lens)) return 'TRUE';
  const inWindow = `${a}.at >= ${refs.fromRef}::timestamptz`;
  return carry ? `(${inWindow} OR ${liveFeedCarriedSql(a, refs)})` : `(${inWindow})`;
}

/** Most urgent first: late, then aging, then due today, then the rest. */
export const LIVE_FEED_URGENCY_RANK: Readonly<Record<LiveFeedUrgency, number>> = { late: 0, aging: 1, due_today: 2 };
const NO_URGENCY_RANK = 3;

/** The urgency rank as SQL over an urgency column. */
export function liveFeedUrgencyRankSql(urgencySql: string): string {
  const arms = Object.entries(LIVE_FEED_URGENCY_RANK).map(([urgency, rank]) => `WHEN '${urgency}' THEN ${rank}`);
  return `(CASE ${urgencySql} ${arms.join(' ')} ELSE ${NO_URGENCY_RANK} END)`;
}

/** The urgencies a board column counts as late (`lateCount`) — they rank first. */
export const LIVE_FEED_LATE_URGENCIES: readonly LiveFeedUrgency[] = ['late', 'aging'];

/** Whether the urgency column `urgencySql` is late, as SQL. */
export function liveFeedLateSql(urgencySql: string): string {
  return `(${urgencySql} IN (${LIVE_FEED_LATE_URGENCIES.map((u) => `'${u}'`).join(', ')}))`;
}

/**
 * The lane order over alias `a` (operator 2026-10-03: lanes order by urgency
 * and age, no Sort): urgency rank — late first — then the longest-waiting on
 * top in an open lane and the newest in a done lane. Undated rows sink; ties
 * break on key so paging never reshuffles equal rows.
 */
export function liveFeedOrderSql(kind: LiveFeedStatusKind, a: string): string {
  return `${liveFeedUrgencyRankSql(`${a}.urgency`)}, ${a}.at ${kind === 'open' ? 'ASC' : 'DESC'} NULLS LAST, ${a}.key`;
}

/** Tracking numbers in list order, deduped — the Copy all. */
export function liveFeedTrackingList(items: ReadonlyArray<Pick<LiveFeedItem, 'tracking'>>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const tracking = item.tracking?.trim();
    if (!tracking || seen.has(tracking)) continue;
    seen.add(tracking);
    out.push(tracking);
  }
  return out;
}
