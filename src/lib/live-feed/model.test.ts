import test from 'node:test';
import assert from 'node:assert/strict';
import {
  liveFeedCarries,
  liveFeedDateRuleSql,
  liveFeedListedSql,
  liveFeedOrderSql,
  liveFeedPreviousRange,
  liveFeedTrackingList,
  liveFeedWindow,
} from './model';
import { buildFeedBoardSql, buildFeedCountsSql, buildFeedMemberRowsSql, buildFeedPageSql, type FeedMembership, type FeedNarrow } from './feed-sql';
import {
  getLiveFeedStatus,
  LIVE_FEED_CHANNELS,
  LIVE_FEED_STATUS_IDS,
  LIVE_FEED_STATUSES,
  liveFeedAccess,
  liveFeedCarrierLabel,
  liveFeedLensApplies,
  liveFeedLensesOf,
  liveFeedStatusInChannel,
  liveFeedStatusesOf,
} from './statuses';

const REFS = { fromRef: '$2', toRef: '$3' };
const RANGE = { from: '2026-09-30', to: '2026-09-30', timeFrom: null, timeTo: null };

test('registry: one lane per state, pipeline order per direction; ids are dot-free; no exceptions', () => {
  assert.deepEqual(
    liveFeedStatusesOf('outbound').map((s) => s.id),
    ['out-to-pack', 'out-packed', 'out-scanned-out', 'out-in-transit', 'out-delivered', 'out-sold-in-person'],
  );
  assert.deepEqual(
    liveFeedStatusesOf('inbound').map((s) => s.id),
    ['in-pickup-to-collect', 'in-delivered-unscanned', 'in-docked', 'in-transit', 'in-unboxed'],
  );
  assert.ok(LIVE_FEED_STATUS_IDS.every((id) => !id.includes('exceptions')), 'exceptions live in the Exceptions hub');
  assert.deepEqual(LIVE_FEED_STATUSES.map((s) => s.id), [...LIVE_FEED_STATUS_IDS]);
  for (const id of LIVE_FEED_STATUS_IDS) {
    assert.doesNotMatch(id, /\./, id);
    assert.equal(getLiveFeedStatus(id).id, id);
  }
  // Open before done within a direction: the Board reads the pipeline left to right.
  for (const dir of ['outbound', 'inbound'] as const) {
    const kinds = liveFeedStatusesOf(dir).map((s) => s.kind);
    assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === b ? 0 : a === 'open' ? -1 : 1)), dir);
  }
});

test('registry: the event lanes are gone (operator 2026-10-03)', () => {
  for (const gone of ['out-ready-pickup', 'out-packed-waiting', 'out-not-accepted', 'out-with-carrier', 'in-pickup-collected']) {
    assert.ok(!(LIVE_FEED_STATUS_IDS as readonly string[]).includes(gone), gone);
  }
});

test('registry: sections and kinds — open lanes are work / moving, done lanes done; one-line labels with long hints', () => {
  const faces = (dir: 'outbound' | 'inbound') => liveFeedStatusesOf(dir).map((s) => [s.label, s.section, s.kind]);
  assert.deepEqual(faces('outbound'), [
    ['To pack', 'work', 'open'],
    ['Packed', 'work', 'open'],
    ['Scanned out', 'moving', 'open'],
    ['In transit', 'moving', 'open'],
    ['Delivered', 'done', 'done'],
    ['Sold in person', 'done', 'done'],
  ]);
  assert.deepEqual(faces('inbound'), [
    ['To collect', 'work', 'open'],
    ['At door', 'work', 'open'],
    ['Docked', 'work', 'open'],
    ['In transit', 'moving', 'open'],
    ['Unboxed', 'done', 'done'],
  ]);
  for (const spec of LIVE_FEED_STATUSES) {
    assert.equal(spec.kind === 'done', spec.section === 'done', spec.id);
    assert.ok(spec.hint.length > spec.label.length, spec.id);
  }
});

test('lenses: entered everywhere; an event lens only on lanes a package reaches after that event', () => {
  assert.deepEqual(liveFeedLensesOf('outbound'), ['entered', 'packed', 'scanned_out', 'delivered']);
  assert.deepEqual(liveFeedLensesOf('inbound'), ['entered', 'received', 'unboxed']);
  const applying = (dir: 'outbound' | 'inbound', lens: Parameters<typeof liveFeedLensApplies>[1]) =>
    liveFeedStatusesOf(dir).filter((s) => liveFeedLensApplies(s, lens)).map((s) => s.id);
  assert.deepEqual(applying('outbound', 'packed'), ['out-packed', 'out-scanned-out', 'out-in-transit', 'out-delivered']);
  assert.deepEqual(applying('outbound', 'scanned_out'), ['out-scanned-out', 'out-in-transit', 'out-delivered']);
  assert.deepEqual(applying('outbound', 'delivered'), ['out-delivered']);
  assert.deepEqual(applying('inbound', 'received'), ['in-docked', 'in-unboxed']);
  assert.deepEqual(applying('inbound', 'unboxed'), ['in-unboxed']);
  for (const spec of LIVE_FEED_STATUSES) {
    assert.ok(spec.lenses.includes('entered'), spec.id);
    for (const lens of spec.lenses) assert.ok(liveFeedLensesOf(spec.direction).includes(lens), `${spec.id} ${lens}`);
  }
});

test('channels: in-person lanes are in person only; To pack and Packed hold counter-pickup orders too', () => {
  for (const spec of LIVE_FEED_STATUSES) {
    assert.ok(spec.channels.length > 0, spec.id);
    for (const channel of spec.channels) assert.ok((LIVE_FEED_CHANNELS as readonly string[]).includes(channel), spec.id);
    if (spec.carrier) assert.ok(spec.channels.includes('online'), spec.id);
  }
  const inPersonOnly = LIVE_FEED_STATUSES.filter((s) => s.channels.length === 1 && s.channels[0] === 'in_person').map((s) => s.id);
  assert.deepEqual(inPersonOnly, ['out-sold-in-person', 'in-pickup-to-collect']);
  assert.deepEqual(getLiveFeedStatus('out-to-pack').channels, ['online', 'in_person']);
  assert.deepEqual(getLiveFeedStatus('out-packed').channels, ['online', 'in_person']);
  assert.deepEqual(liveFeedStatusesOf('outbound', 'in_person').map((s) => s.id), ['out-to-pack', 'out-packed', 'out-sold-in-person']);
  assert.equal(liveFeedStatusInChannel(getLiveFeedStatus('in-unboxed'), 'in_person'), false);
});

test('access: each direction needs its own permission', () => {
  assert.deepEqual(liveFeedAccess(new Set(['packing.view'])), { outbound: true, inbound: false });
  assert.deepEqual(liveFeedAccess(new Set(['receiving.view'])), { outbound: false, inbound: true });
});

test('carrier labels: stored tokens read as brands; blank and UNKNOWN read Unknown', () => {
  assert.equal(liveFeedCarrierLabel('FEDEX'), 'FedEx');
  assert.equal(liveFeedCarrierLabel('UNKNOWN'), 'Unknown');
  assert.equal(liveFeedCarrierLabel(null), 'Unknown');
});

test('window: warehouse days, DST-exact; time of day narrows to the minute, inclusive', () => {
  assert.deepEqual(liveFeedWindow(RANGE), { fromIso: '2026-09-30T07:00:00.000Z', toIso: '2026-10-01T07:00:00.000Z' });
  // Across the November DST change the last day is 25 hours long.
  assert.deepEqual(liveFeedWindow({ ...RANGE, from: '2026-10-31', to: '2026-11-01' }), {
    fromIso: '2026-10-31T07:00:00.000Z',
    toIso: '2026-11-02T08:00:00.000Z',
  });
  assert.deepEqual(liveFeedWindow({ ...RANGE, timeFrom: '09:00', timeTo: '13:30' }), {
    fromIso: '2026-09-30T16:00:00.000Z',
    toIso: '2026-09-30T20:31:00.000Z',
  });
});

test('previous period: the same length immediately before, same times of day', () => {
  assert.deepEqual(liveFeedPreviousRange(RANGE), { ...RANGE, from: '2026-09-29', to: '2026-09-29' });
  assert.deepEqual(liveFeedPreviousRange({ ...RANGE, from: '2026-09-24', timeFrom: '08:00' }), {
    from: '2026-09-17',
    to: '2026-09-23',
    timeFrom: '08:00',
    timeTo: null,
  });
});

test('date rule: the lens instant inside the window; a carrying lane (open, entered) keeps everything before its end', () => {
  const inside = (col: string) => `(m.${col} >= $2::timestamptz AND m.${col} < $3::timestamptz)`;
  assert.equal(liveFeedDateRuleSql('open', 'entered', 'm', REFS), '(m.at < $3::timestamptz)');
  assert.equal(liveFeedDateRuleSql('done', 'entered', 'm', REFS), inside('at'));
  assert.equal(liveFeedDateRuleSql('open', 'packed', 'm', REFS), inside('packed_at'));
  assert.equal(liveFeedDateRuleSql('done', 'scanned_out', 'm', REFS), inside('scanned_out_at'));
  assert.equal(liveFeedDateRuleSql('done', 'unboxed', 'm', REFS), inside('unboxed_at'));
  assert.equal(liveFeedCarries('open', 'entered'), true);
  assert.equal(liveFeedCarries('open', 'packed'), false);
  assert.equal(liveFeedCarries('done', 'entered'), false);
});

test('listed rows: a carrying lane lists the window; carry adds what entered before it and still sits there', () => {
  assert.equal(liveFeedListedSql('open', 'entered', false, 'p', REFS), '(p.at >= $2::timestamptz)');
  assert.equal(
    liveFeedListedSql('open', 'entered', true, 'p', REFS),
    '(p.at >= $2::timestamptz OR (p.at < $2::timestamptz AND COALESCE(p.carries, true)))',
  );
  assert.equal(liveFeedListedSql('done', 'entered', true, 'p', REFS), 'TRUE');
  assert.equal(liveFeedListedSql('open', 'packed', true, 'p', REFS), 'TRUE');
});

test('order: urgency rank (late first), then oldest-first in an open lane and newest-first in a done lane', () => {
  assert.match(
    liveFeedOrderSql('open', 'p'),
    /^\(CASE p\.urgency WHEN 'late' THEN 0 WHEN 'aging' THEN 1 WHEN 'due_today' THEN 2 ELSE 3 END\), p\.at ASC NULLS LAST, p\.key$/,
  );
  assert.match(liveFeedOrderSql('done', 'p'), /p\.at DESC NULLS LAST, p\.key$/);
});

const SCANNED: FeedMembership = { id: 'out-scanned-out', kind: 'open', channels: ['online'], carrier: true, groupBy: 'carrier', sql: 'SELECT 1' };
const TO_PACK: FeedMembership = { id: 'out-to-pack', kind: 'open', channels: ['online', 'in_person'], carrier: true, groupBy: 'staff', sql: 'SELECT 2' };
const SOLD: FeedMembership = { id: 'out-sold-in-person', kind: 'done', channels: ['in_person'], carrier: false, groupBy: 'staff', sql: 'SELECT 3' };
const NARROW: FeedNarrow = { lens: 'entered', carry: false, sql: '', withTracking: false, ctes: [], channelRef: null, carrierRef: '$4' };

test('paging: one lane, its count after the picks, items LIMIT/OFFSET in lane order', () => {
  const sql = buildFeedPageSql(SOLD, NARROW, { limitRef: '$5', offsetRef: '$6' });
  assert.match(sql, /picked AS MATERIALIZED \(SELECT p\.key, .* FROM f_0 p WHERE TRUE AND TRUE AND TRUE\)/);
  assert.match(sql, /\(SELECT COUNT\(\*\)::int FROM picked\) AS count/);
  assert.match(sql, /pp\.at DESC NULLS LAST, pp\.key LIMIT \$5::int OFFSET \$6::int/);
  assert.match(sql, /m\.at >= \$2::timestamptz AND m\.at < \$3::timestamptz/);
  // A one-channel membership's rows are that channel; flags ride along.
  assert.match(sql, /'in_person'::text AS channel/);
  assert.match(sql, /'flags', i\.flags/);
});

test('counts: each facet tallies before its own pick, the total after both, on the listed rows — one builder', () => {
  const sql = buildFeedCountsSql([SCANNED, TO_PACK], { ...NARROW, channelRef: '$5' });
  assert.match(sql, /'out-scanned-out'::text AS status_id/);
  assert.match(
    sql,
    /FROM f_0 c WHERE \(c\.at >= \$2::timestamptz\) AND 'online'::text = \$5::text AND COALESCE\(c\.carrier, 'UNKNOWN'\) = \$4::text\) AS count/,
  );
  // Carrier tallies: after the channel pick, before the carrier pick.
  assert.match(sql, /FROM f_0 g0 WHERE \(g0\.at >= \$2::timestamptz\) AND 'online'::text = \$5::text GROUP BY 1/);
  // Channel tallies: after the carrier pick; a mixed membership reads the row's channel.
  assert.match(
    sql,
    /SELECT COALESCE\(g0\.channel, 'online'\) AS key, COUNT\(\*\)::int AS n FROM f_1 g0 WHERE \(g0\.at >= \$2::timestamptz\) AND COALESCE\(g0\.carrier, 'UNKNOWN'\) = \$4::text GROUP BY 1/,
  );
  // A carrying lane is bounded only by the window's end.
  assert.match(sql, /f_1 AS MATERIALIZED \(\s+SELECT m\.\* FROM \(SELECT 2\s+\) m\s+WHERE \(m\.at < \$3::timestamptz\)/);
});

test('counts under an event lens: every lane bounded by that instant in the window', () => {
  const sql = buildFeedCountsSql([SCANNED], { ...NARROW, lens: 'packed', carrierRef: null });
  assert.match(sql, /WHERE \(m\.packed_at >= \$2::timestamptz AND m\.packed_at < \$3::timestamptz\)/);
  assert.match(sql, /FROM f_0 c WHERE TRUE AND TRUE AND TRUE\) AS count/);
});

test('carrier pick: narrows carrier lanes only; an in-person lane ignores it and tallies no carriers', () => {
  const sql = buildFeedCountsSql([SOLD], NARROW);
  assert.match(sql, /FROM f_0 c WHERE TRUE AND TRUE AND TRUE\) AS count/);
  assert.match(sql, /'\[\]'::json AS carriers/);
});

test('board: one statement, every column its count, late count, oldest, carried over, top groups and first items capped', () => {
  const sql = buildFeedBoardSql([TO_PACK, SCANNED, SOLD], { ...NARROW, channelRef: '$5' }, { capRef: '$6', groupCapRef: '$7' });
  assert.equal(sql.match(/UNION ALL/g)?.length, 2);
  for (const [i, id] of ['out-to-pack', 'out-scanned-out', 'out-sold-in-person'].entries()) {
    assert.match(sql, new RegExp(`b_${i} AS MATERIALIZED \\(SELECT .* FROM f_${i} p WHERE`));
    assert.match(sql, new RegExp(`'${id}'::text AS status_id,\\s+\\(SELECT COUNT\\(\\*\\)::int FROM b_${i}\\) AS count`));
    assert.match(sql, new RegExp(`FROM b_${i} c WHERE \\(c\\.urgency IN \\('late', 'aging'\\)\\)\\) AS late_count`));
  }
  assert.match(sql, /\(SELECT MIN\(c\.at\) FROM b_0 c\) AS oldest_at/);
  assert.equal(sql.match(/NULL::timestamptz AS oldest_at/g)?.length, 1);
  // Carried over: the open lanes' rows before the window still known to sit there, after both picks.
  assert.match(
    sql,
    /FROM f_0 k WHERE \(k\.at < \$2::timestamptz AND COALESCE\(k\.carries, true\)\) AND COALESCE\(k\.channel, 'online'\) = \$5::text AND COALESCE\(k\.carrier, 'UNKNOWN'\) = \$4::text\) AS carried_over/,
  );
  assert.match(sql, /0 AS carried_over,\s+\(SELECT json_build_object[\s\S]*FROM b_2 g0/);
  assert.match(sql, /SELECT COALESCE\(g0\.carrier, 'UNKNOWN'\) AS key, NULL::text AS label, COUNT\(\*\)::int AS n\s+FROM b_1 g0/);
  assert.match(sql, /SELECT COALESCE\(g0\.staff_id::text, 'unassigned'\) AS key, MAX\(s\.name\) AS label, COUNT\(\*\)::int AS n\s+FROM b_0 g0/);
  assert.equal(sql.match(/FILTER \(WHERE g\.rn <= \$7::int\)/g)?.length, 3);
  assert.equal(sql.match(/LIMIT \$6::int/g)?.length, 3);
  assert.match(sql, /ORDER BY \(CASE q\.urgency WHEN 'late' THEN 0 .* END\), q\.at ASC NULLS LAST, q\.key LIMIT \$6::int/);
});

test('board with carry: the carried-over rows are listed too', () => {
  const sql = buildFeedBoardSql([TO_PACK], { ...NARROW, carry: true, carrierRef: null }, { capRef: '$6', groupCapRef: '$7' });
  assert.match(sql, /FROM f_0 p WHERE \(p\.at >= \$2::timestamptz OR \(p\.at < \$2::timestamptz AND COALESCE\(p\.carries, true\)\)\)/);
});

test('copy all: the listed members in lane order; tracking numbers deduped, blanks dropped', () => {
  assert.match(buildFeedMemberRowsSql(SOLD, NARROW), /ORDER BY \(CASE p\.urgency .* END\), p\.at DESC NULLS LAST, p\.key$/);
  assert.deepEqual(
    liveFeedTrackingList([{ tracking: 'B' }, { tracking: ' A ' }, { tracking: 'B' }, { tracking: null }, { tracking: '' }]),
    ['B', 'A'],
  );
});
