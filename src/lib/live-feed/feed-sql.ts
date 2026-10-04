/**
 * The Live feed's statement shape — the ONE builder the lane pages, the
 * Board, the Copy all, the lane counts and the Carrier / Channel facets read.
 * Every lane membership (outbound in `outbound-sql.ts`, inbound in
 * `inbound-sql.ts`) selects the same columns ({@link feedRowSql}); a
 * statement bounds each membership by the lens date rule, staff and find (as
 * `f_<i>`), then the channel and carrier picks on top — so each facet's
 * tallies are counted before its own pick (and after the other's), and the
 * total after both. A carrying lane (open, lens `entered`) keeps the rows
 * that entered before the window in `f_<i>`: they are its `carriedOver`, and
 * listed only with `carry`.
 */

import {
  liveFeedCarriedSql,
  liveFeedCarries,
  liveFeedDateRuleSql,
  liveFeedLateSql,
  liveFeedListedSql,
  liveFeedOrderSql,
} from '@/lib/live-feed/model';
import type {
  LiveFeedChannel,
  LiveFeedGroupBy,
  LiveFeedLens,
  LiveFeedStatusId,
  LiveFeedStatusKind,
} from '@/lib/live-feed/statuses';

/** The uniform membership columns, in order, with their SQL types. */
const FEED_COLUMNS = {
  key: 'text',
  /** When the row entered its current lane — the `entered` lens. */
  at: 'timestamptz',
  staff_id: 'int',
  channel: 'text',
  carrier: 'text',
  tracking: 'text',
  order_row_id: 'int',
  shipment_id: 'bigint',
  receiving_id: 'int',
  line_id: 'int',
  po_number: 'text',
  /** In person: the record's own id (local pickup order, counter visit, Square sale). */
  record_id: 'text',
  customer: 'text',
  reason: 'text',
  urgency: 'text',
  sub: 'text',
  /** The lens instants a lane's rows can carry (NULL = not reached, or not this lane's). */
  packed_at: 'timestamptz',
  scanned_out_at: 'timestamptz',
  delivered_at: 'timestamptz',
  received_at: 'timestamptz',
  unboxed_at: 'timestamptz',
  /** False when a row that entered before the window is not known to still sit in the lane (NULL = true). */
  carries: 'boolean',
  /** `LiveFeedItemFlag`s. */
  flags: 'text[]',
} as const;
export type FeedColumn = keyof typeof FEED_COLUMNS;

/** A membership's SELECT list: each named column cast to its type, the rest NULL. `key` is required. */
export function feedRowSql(cols: Partial<Record<FeedColumn, string>> & { key: string }): string {
  return (Object.keys(FEED_COLUMNS) as FeedColumn[])
    .map((name) => `(${cols[name] ?? 'NULL'})::${FEED_COLUMNS[name]} AS ${name}`)
    .join(',\n           ');
}

/** The carrier token as Fulfilled's `carrier` filter compares it (upper-cased); blank or no shipment → `UNKNOWN`. */
export const FEED_CARRIER_SQL = `UPPER(COALESCE(NULLIF(BTRIM(stn.carrier), ''), 'UNKNOWN'))`;

/** A row's carrier facet key — a membership with no carrier reads `UNKNOWN`. */
const CARRIER_KEY_SQL = (a: string) => `COALESCE(${a}.carrier, 'UNKNOWN')`;

/** `aging` once an open record has sat in its state past a day. */
export function feedAgingSql(atSql: string): string {
  return `CASE WHEN ${atSql} < now() - interval '24 hours' THEN 'aging' END`;
}

/** The statement's fixed binds: `$1` org; `$2`/`$3` the (timed) window `[from, to)`. */
export const FEED_REFS = { org: '$1', from: '$2', to: '$3' } as const;
const WINDOW_REFS = { fromRef: FEED_REFS.from, toRef: FEED_REFS.to } as const;

export interface FeedMembership {
  id: LiveFeedStatusId;
  kind: LiveFeedStatusKind;
  /** The lane's channels; a one-channel membership's rows are that channel, a mixed one's say it in `channel`. */
  channels: readonly LiveFeedChannel[];
  /** The carrier pick narrows it (and its carriers are tallied). */
  carrier: boolean;
  /** What the Board column's top groups tally. */
  groupBy: LiveFeedGroupBy;
  /** One SELECT of {@link feedRowSql} columns over `FEED_REFS` (and the narrowing's shared CTEs). */
  sql: string;
}

export interface FeedItemRow {
  key: string;
  at: string | null;
  staff_id: number | null;
  staff_name: string | null;
  channel: string;
  carrier: string | null;
  tracking: string | null;
  order_row_id: number | null;
  shipment_id: number | string | null;
  receiving_id: number | null;
  line_id: number | null;
  po_number: string | null;
  record_id: string | null;
  customer: string | null;
  reason: string | null;
  urgency: string | null;
  sub: string | null;
  flags: string[] | null;
}

/** Lens, staff / find / channel / carrier narrowing, built per direction by the loader. */
export interface FeedNarrow {
  /** Which instant the window bounds. */
  lens: LiveFeedLens;
  /** Carrying lanes also list their carried-over rows. */
  carry: boolean;
  /** AND-ed staff / find predicate over the membership alias `m` (and `trk` when `withTracking`), or ''. */
  sql: string;
  /** Adds the `trk` lateral — `m.tracking` shaped like a `shipping_tracking_numbers` row for the find's tracking match. */
  withTracking: boolean;
  /** CTEs the memberships or the predicate read (`name AS MATERIALIZED (…)`), computed once ahead of every membership. */
  ctes: string[];
  /** The bound channel pick (`$n`), or null. */
  channelRef: string | null;
  /** The bound carrier pick (`$n`), or null. */
  carrierRef: string | null;
}

/** A row's channel over alias `a`: the one-channel membership's literal, else the row's own. */
function channelKeySql(m: FeedMembership, a: string): string {
  return m.channels.length === 1 ? `'${m.channels[0]}'::text` : `COALESCE(${a}.channel, '${m.channels[0]}')`;
}

/** `WITH …` — each membership bounded by the lens date rule, staff and find (not channel / carrier), as `f_<i>`. */
function feedWithSql(memberships: readonly FeedMembership[], narrow: FeedNarrow): string {
  const ctes = memberships.map((m, i) => {
    const trk = narrow.withTracking
      ? `
      CROSS JOIN LATERAL (
        SELECT m.tracking AS tracking_number_raw,
               regexp_replace(UPPER(COALESCE(m.tracking, '')), '[^A-Z0-9]', '', 'g') AS tracking_number_normalized
      ) trk`
      : '';
    const rules = [liveFeedDateRuleSql(m.kind, narrow.lens, 'm', WINDOW_REFS), narrow.sql].filter(Boolean).join('\n        AND ');
    return `f_${i} AS MATERIALIZED (
      SELECT m.* FROM (${m.sql}
      ) m${trk}
      WHERE ${rules}
    )`;
  });
  // Every fixed bind is typed here once: a statement whose memberships never
  // read a bind would otherwise leave it unreferenced and untyped, which
  // Postgres refuses.
  const window = `feed_window AS (
      SELECT ${FEED_REFS.from}::timestamptz AS from_at, ${FEED_REFS.to}::timestamptz AS to_at
    )`;
  return `
  WITH
    ${[window, ...narrow.ctes, ...ctes].join(',\n    ')}`;
}

/** The carrier pick over alias `a` — only on a carrier membership — or TRUE. */
function carrierPickSql(m: FeedMembership, narrow: FeedNarrow, a: string): string {
  return narrow.carrierRef && m.carrier ? `${CARRIER_KEY_SQL(a)} = ${narrow.carrierRef}::text` : 'TRUE';
}

/** The channel pick over alias `a`, or TRUE. */
function channelPickSql(m: FeedMembership, narrow: FeedNarrow, a: string): string {
  return narrow.channelRef ? `${channelKeySql(m, a)} = ${narrow.channelRef}::text` : 'TRUE';
}

/** The listed rows over alias `a` (the window, plus carried-over with `carry`). */
function listedSql(m: FeedMembership, narrow: FeedNarrow, a: string): string {
  return liveFeedListedSql(m.kind, narrow.lens, narrow.carry, a, WINDOW_REFS);
}

/** Both picks over alias `a`, on the listed rows. */
function picksSql(m: FeedMembership, narrow: FeedNarrow, a: string): string {
  return `${listedSql(m, narrow, a)} AND ${channelPickSql(m, narrow, a)} AND ${carrierPickSql(m, narrow, a)}`;
}

/** Exact tallies of `f_<i>` by `keySql(alias)` under `where` — a facet's options. */
function tallySql(i: number, keySql: (a: string) => string, where: string): string {
  return `(SELECT COALESCE(json_agg(json_build_object('key', g.key, 'count', g.n) ORDER BY g.n DESC, g.key), '[]'::json)
         FROM (SELECT ${keySql('g0')} AS key, COUNT(*)::int AS n FROM f_${i} g0 WHERE ${where} GROUP BY 1) g)`;
}

/** Row shape of {@link buildFeedCountsSql}. */
export interface FeedCountRow {
  status_id: LiveFeedStatusId;
  /** Listed rows after both picks. */
  count: number;
  /** Carrier lanes: carrier tallies before the carrier pick (after the channel pick); else []. */
  carriers: Array<{ key: string; count: number }>;
  /** Channel tallies before the channel pick (after the carrier pick). */
  channels: Array<{ key: string; count: number }>;
}

/** Every membership's exact count (after both picks), its carrier tallies and its channel tallies. */
export function buildFeedCountsSql(memberships: readonly FeedMembership[], narrow: FeedNarrow): string {
  const selects = memberships.map((m, i) => {
    const listed = listedSql(m, narrow, 'g0');
    return `SELECT
      '${m.id}'::text AS status_id,
      (SELECT COUNT(*)::int FROM f_${i} c WHERE ${picksSql(m, narrow, 'c')}) AS count,
      ${m.carrier ? tallySql(i, CARRIER_KEY_SQL, `${listed} AND ${channelPickSql(m, narrow, 'g0')}`) : `'[]'::json`} AS carriers,
      ${tallySql(i, (a) => channelKeySql(m, a), `${listed} AND ${carrierPickSql(m, narrow, 'g0')}`)} AS channels`;
  });
  return `${feedWithSql(memberships, narrow)}
  ${selects.join('\n  UNION ALL\n  ')}`;
}

/** Items of the picked rows `src` (alias `i`), dressed with the staff name, as one json array in `order`. */
function itemsJsonSql(src: string, order: (a: string) => string): string {
  return `(SELECT COALESCE(json_agg(json_build_object(
              'key', i.key, 'at', i.at, 'staff_id', i.staff_id, 'staff_name', s.name, 'channel', i.channel,
              'carrier', i.carrier, 'tracking', i.tracking, 'order_row_id', i.order_row_id,
              'shipment_id', i.shipment_id, 'receiving_id', i.receiving_id, 'line_id', i.line_id,
              'po_number', i.po_number, 'record_id', i.record_id,
              'customer', i.customer, 'reason', i.reason, 'urgency', i.urgency, 'sub', i.sub, 'flags', i.flags
            ) ORDER BY ${order('i')}), '[]'::json)
       FROM (${src}) i
       LEFT JOIN staff s ON s.id = i.staff_id)`;
}

/** The picked rows of `f_<i>` with the row's channel resolved, as a SELECT over alias `p`. */
function pickedRowsSql(m: FeedMembership, i: number, narrow: FeedNarrow): string {
  const cols = (Object.keys(FEED_COLUMNS) as FeedColumn[]).map((name) =>
    name === 'channel' ? `${channelKeySql(m, 'p')} AS channel` : `p.${name}`,
  );
  return `SELECT ${cols.join(', ')} FROM f_${i} p WHERE ${picksSql(m, narrow, 'p')}`;
}

/** Row shape of {@link buildFeedPageSql}. */
export interface FeedPageRow {
  count: number;
  items: FeedItemRow[];
}

/** ONE membership's exact count and one page of its items in lane order. `limitRef` / `offsetRef` are bound refs. */
export function buildFeedPageSql(membership: FeedMembership, narrow: FeedNarrow, page: { limitRef: string; offsetRef: string }): string {
  const order = (a: string) => liveFeedOrderSql(membership.kind, a);
  return `${feedWithSql([membership], narrow)},
    picked AS MATERIALIZED (${pickedRowsSql(membership, 0, narrow)})
  SELECT
    (SELECT COUNT(*)::int FROM picked) AS count,
    ${itemsJsonSql(
      `SELECT * FROM picked pp ORDER BY ${order('pp')} LIMIT ${page.limitRef}::int OFFSET ${page.offsetRef}::int`,
      order,
    )} AS items`;
}

/** Row shape of {@link buildFeedBoardSql}. */
export interface FeedBoardRow {
  status_id: LiveFeedStatusId;
  count: number;
  /** Picked rows that are late or aging. */
  late_count: number;
  /** Open memberships: the oldest picked row's instant (pg parses it to a Date); done memberships: null. */
  oldest_at: Date | string | null;
  /** Carrying memberships: rows (after both picks) that entered before the window and still sit there; else 0. */
  carried_over: number;
  /** The top `groupCapRef` groups (`label` null on carrier groups — the loader names them) and how many groups exist. */
  groups: { top: Array<{ key: string; label: string | null; count: number }>; total: number };
  items: FeedItemRow[];
}

/** A board column's group key / label over the picked row `g0` (with `staff s` joined). */
const GROUP_KEY_SQL: Readonly<Record<LiveFeedGroupBy, { key: string; label: string }>> = {
  carrier: { key: CARRIER_KEY_SQL('g0'), label: 'NULL::text' },
  staff: { key: `COALESCE(g0.staff_id::text, 'unassigned')`, label: 'MAX(s.name)' },
};

/** The top `capRef` groups of `src` by `groupBy`, plus the group total, as one json object. */
function groupsJsonSql(src: string, groupBy: LiveFeedGroupBy, capRef: string): string {
  const { key, label } = GROUP_KEY_SQL[groupBy];
  return `(SELECT json_build_object(
           'top', COALESCE(json_agg(json_build_object('key', g.key, 'label', g.label, 'count', g.n) ORDER BY g.n DESC, g.key)
                    FILTER (WHERE g.rn <= ${capRef}::int), '[]'::json),
           'total', COUNT(*)::int)
       FROM (SELECT g1.*, row_number() OVER (ORDER BY g1.n DESC, g1.key) AS rn
               FROM (SELECT ${key} AS key, ${label} AS label, COUNT(*)::int AS n
                       FROM ${src} g0
                       LEFT JOIN staff s ON s.id = g0.staff_id
                      GROUP BY 1) g1) g)`;
}

/**
 * Every membership's exact count, late count, oldest instant (open),
 * carried-over count (carrying lanes), top groups and first `capRef` items —
 * late first — the Board's columns, one statement. Each column's facts read
 * the same picked rows (`b_<i>`).
 */
export function buildFeedBoardSql(
  memberships: readonly FeedMembership[],
  narrow: FeedNarrow,
  board: { capRef: string; groupCapRef: string },
): string {
  const picked = memberships.map((m, i) => `b_${i} AS MATERIALIZED (${pickedRowsSql(m, i, narrow)})`);
  const selects = memberships.map((m, i) => {
    const order = (a: string) => liveFeedOrderSql(m.kind, a);
    const carried = liveFeedCarries(m.kind, narrow.lens)
      ? `(SELECT COUNT(*)::int FROM f_${i} k WHERE ${liveFeedCarriedSql('k', WINDOW_REFS)} AND ${channelPickSql(m, narrow, 'k')} AND ${carrierPickSql(m, narrow, 'k')})`
      : '0';
    return `SELECT
      '${m.id}'::text AS status_id,
      (SELECT COUNT(*)::int FROM b_${i}) AS count,
      (SELECT COUNT(*)::int FROM b_${i} c WHERE ${liveFeedLateSql('c.urgency')}) AS late_count,
      ${m.kind === 'open' ? `(SELECT MIN(c.at) FROM b_${i} c)` : 'NULL::timestamptz'} AS oldest_at,
      ${carried} AS carried_over,
      ${groupsJsonSql(`b_${i}`, m.groupBy, board.groupCapRef)} AS groups,
      ${itemsJsonSql(`SELECT * FROM b_${i} q ORDER BY ${order('q')} LIMIT ${board.capRef}::int`, order)} AS items`;
  });
  return `${feedWithSql(memberships, narrow)},
    ${picked.join(',\n    ')}
  ${selects.join('\n  UNION ALL\n  ')}`;
}

/** Row shape of {@link buildFeedMemberRowsSql}. */
export interface FeedMemberRow {
  key: string;
  tracking: string | null;
}

/** Every listed member of ONE membership (unpaged) in lane order — the Copy all, under the same narrowing as the lane. */
export function buildFeedMemberRowsSql(membership: FeedMembership, narrow: FeedNarrow): string {
  return `${feedWithSql([membership], narrow)}
  SELECT p.key, p.tracking FROM f_0 p WHERE ${picksSql(membership, narrow, 'p')} ORDER BY ${liveFeedOrderSql(membership.kind, 'p')}`;
}
