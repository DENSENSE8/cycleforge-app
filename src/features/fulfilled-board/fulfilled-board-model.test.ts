import test from 'node:test';
import assert from 'node:assert/strict';
import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import { journeyClockSpanText } from '@/lib/nav/fulfilled/journey-clock';
import { FULFILLED_BUCKET_IDS, FULFILLED_BUCKETS } from '@/lib/nav/locate/bucket-precedence';
import {
  FULFILLED_BUCKET_HINT,
  NO_CARRIER_GROUP,
  fulfilledBoardColumns,
  fulfilledColumnMeta,
  fulfilledHeadline,
  fulfilledSyncWarning,
  groupCardsByCarrier,
  journeyCarrierLine,
  journeyFreshness,
  visibleBoardColumns,
} from './fulfilled-board-model';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
const ahead = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

function entry(ref: string, bucket: string, clock: { since: string; due: string | null } | null, deliveredAt: string | null = null): NavLocateEntry {
  return {
    ref,
    buckets: [bucket],
    title: null,
    detail: null,
    recordHref: null,
    // Only the clock and the delivery stamp matter to the board model; the rest of the facts stay out of the fixture.
    facts: clock || deliveredAt ? ({ clock, deliveredAt } as unknown as NavLocateEntry['facts']) : null,
  };
}

function buckets(counts: Record<string, number>): NavLocateBucket[] {
  return FULFILLED_BUCKETS.map((bucket) => ({ id: bucket.id, label: bucket.label, tone: bucket.tone, href: null, count: counts[bucket.id] ?? 0 }));
}

test('every bucket is a column, in FULFILLED_BUCKETS order, counted by the answer', () => {
  const columns = fulfilledBoardColumns([entry('A', 'late', null)], buckets({ late: 7 }), NOW);
  assert.deepEqual(
    columns.map((column) => column.id),
    FULFILLED_BUCKET_IDS,
  );
  const late = columns.find((column) => column.id === 'late')!;
  // The header is the answer's count, never the cards painted.
  assert.equal(late.count, 7);
  assert.equal(late.cards.length, 1);
  assert.equal(late.section, 'act');
});

test('a column is worst first: the larger share of its threshold, then the older', () => {
  const rows = [
    entry('calm', 'in_transit', { since: ago(10), due: ahead(62) }),
    entry('over', 'in_transit', { since: ago(80), due: ago(8) }),
    entry('near', 'in_transit', { since: ago(50), due: ahead(22) }),
    entry('none', 'in_transit', null),
  ];
  const [column] = fulfilledBoardColumns(rows, buckets({ in_transit: 4 }), NOW).filter((c) => c.id === 'in_transit');
  assert.deepEqual(
    column!.cards.map((card) => card.entry.ref),
    ['over', 'near', 'calm', 'none'],
  );
  assert.equal(column!.over, 1);
  assert.equal(column!.oldest, '3d');
  assert.equal(fulfilledColumnMeta(column!), '1 over · oldest 3d');
});

test('a column with no threshold says its oldest alone', () => {
  const rows = [entry('X', 'exception', { since: ago(30), due: null }), entry('Y', 'exception', { since: ago(5), due: null })];
  const [column] = fulfilledBoardColumns(rows, buckets({ exception: 2 }), NOW).filter((c) => c.id === 'exception');
  assert.equal(fulfilledColumnMeta(column!), 'oldest 30h');
});

test('before the viewer has a now, no clock is faced and the meta is empty', () => {
  const rows = [entry('A', 'late', { since: ago(30), due: ago(2) })];
  const [column] = fulfilledBoardColumns(rows, buckets({ late: 1 }), null).filter((c) => c.id === 'late');
  assert.equal(column!.cards[0]!.face, null);
  assert.equal(fulfilledColumnMeta(column!), '');
});

test('the headline: Act now and its overs, the named pressures, check-ins due, delivered', () => {
  const rows = [
    entry('L1', 'late', { since: ago(80), due: ago(8) }),
    entry('L2', 'late', { since: ago(10), due: ahead(62) }),
    entry('S', 'stalled', { since: ago(100), due: ago(28) }),
    entry('C', 'check_in_due', { since: ago(1), due: ahead(1) }, ago(30)),
    entry('D', 'delivered', null, ago(50)),
    entry('T', 'in_transit', { since: ago(1), due: ahead(71) }),
  ];
  const columns = fulfilledBoardColumns(rows, buckets({ late: 2, stalled: 1, check_in_due: 1, delivered: 1, in_transit: 1 }), NOW);
  assert.deepEqual(fulfilledHeadline(columns, rows), {
    actNow: 4,
    actNowOver: 2,
    late: 2,
    stalled: 1,
    noMovement: 0,
    checkInsDue: 1,
    delivered: 2,
  });
});

test('the clock span: age / limit, the age alone, or nothing', () => {
  assert.equal(journeyClockSpanText({ age: '3d', limit: '1d', ratio: 3, tone: 'over', ageMs: 1 }), '3d / 1d');
  assert.equal(journeyClockSpanText({ age: '5h', limit: null, ratio: null, tone: 'none', ageMs: 1 }), '5h');
  assert.equal(journeyClockSpanText(null), '');
});

test('every bucket carries a one-line definition', () => {
  for (const id of FULFILLED_BUCKET_IDS) assert.ok(FULFILLED_BUCKET_HINT[id] && !FULFILLED_BUCKET_HINT[id].includes('\n'), id);
});

function carried(ref: string, carrier: string | null): NavLocateEntry {
  return { ref, buckets: ['in_transit'], title: null, detail: null, recordHref: null, facts: { carrier } as unknown as NavLocateEntry['facts'] };
}

test('group by carrier: UPS, FedEx, USPS first, others A to Z, no carrier last; urgency order kept', () => {
  const cards = [carried('1', 'FEDEX'), carried('2', null), carried('3', 'UPS'), carried('4', 'OnTrac'), carried('5', 'USPS'), carried('6', 'ups')].map(
    (entry) => ({ entry, face: null }),
  );
  const groups = groupCardsByCarrier(cards);
  assert.deepEqual(
    groups.map((group) => [group.carrier, group.cards.map((card) => card.entry.ref)]),
    [
      ['UPS', ['3', '6']],
      ['FedEx', ['1']],
      ['USPS', ['5']],
      ['OnTrac', ['4']],
      [NO_CARRIER_GROUP, ['2']],
    ],
  );
});

test('hide Done columns and hide Untracked drop exactly those columns', () => {
  const columns = fulfilledBoardColumns([], buckets({}), NOW);
  const all = visibleBoardColumns(columns, { hideDone: false, hideUntracked: false });
  assert.equal(all.length, columns.length);
  const trimmed = visibleBoardColumns(columns, { hideDone: true, hideUntracked: true });
  assert.ok(trimmed.every((column) => column.section !== 'done' && column.id !== 'untracked'));
  assert.equal(trimmed.length, columns.filter((column) => column.section !== 'done').length - 1);
});

test('the card line: status · place · when (PT) · ETA; delivered says when it landed', () => {
  // 1Z16D1R0YW22415180, measured 2026-10-06: IN_TRANSIT at Anaheim CA, 03:54Z, ETA Oct 9.
  const moving = {
    deliveredAt: null,
    lastEvent: { label: 'Departed from Facility', at: '2026-10-06T03:54:00.000Z', status: 'In transit' },
    lastEventPlace: 'Anaheim, CA',
    eta: '2026-10-09T19:00:00.000Z',
  };
  assert.equal(journeyCarrierLine(moving), 'In transit · Anaheim, CA · Oct 5, 8:54 PM · ETA Oct 9');
  // No status word: the carrier's own words; no place, no ETA.
  assert.equal(
    journeyCarrierLine({ ...moving, lastEvent: { label: 'Shipment Ready for UPS', at: '2026-10-05T21:31:00.000Z' }, lastEventPlace: null, eta: null }),
    'Shipment Ready for UPS · Oct 5, 2:31 PM',
  );
  assert.equal(journeyCarrierLine({ ...moving, deliveredAt: '2026-10-07T21:10:00.000Z', lastEventPlace: 'Irvine, CA' }), 'Delivered Oct 7, 2:10 PM · Irvine, CA');
  assert.equal(journeyCarrierLine({ deliveredAt: null, lastEvent: null, lastEventPlace: null, eta: null }), null);
  assert.equal(journeyCarrierLine(null), null);
});

test('freshness: Checked <n> ago, the poll error kept for the hover, nothing when never polled', () => {
  assert.deepEqual(journeyFreshness({ lastPoll: { at: ago(3), error: null } }, NOW), { text: 'Checked 3h ago', error: null });
  assert.deepEqual(journeyFreshness({ lastPoll: { at: ago(0.2), error: null } }, NOW), { text: 'Checked 12m ago', error: null });
  assert.deepEqual(journeyFreshness({ lastPoll: { at: ago(0), error: null } }, NOW), { text: 'Checked just now', error: null });
  assert.deepEqual(journeyFreshness({ lastPoll: { at: ago(72), error: null } }, NOW), { text: 'Checked 3d ago', error: null });
  assert.deepEqual(journeyFreshness({ lastPoll: { at: ago(12), error: 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required' } }, NOW), {
    text: 'Checked 12h ago',
    error: 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required',
  });
  assert.deepEqual(journeyFreshness({ lastPoll: { at: null, error: 'Query read timeout' } }, NOW), { text: 'Never checked', error: 'Query read timeout' });
  assert.equal(journeyFreshness({ lastPoll: null }, NOW), null);
});

test('the sync warning names each failing enabled carrier since its last good poll, only when true', () => {
  const row = { enabled: true, open: 150, failingOpen: 0, lastOkAt: '2026-10-05T21:31:00.000Z', configFault: false, lastError: null };
  assert.equal(fulfilledSyncWarning(null), null);
  assert.equal(fulfilledSyncWarning({ carriers: [{ carrier: 'UPS', ...row }] }), null);
  // USPS is off (access pending): never an alarm.
  assert.equal(fulfilledSyncWarning({ carriers: [{ carrier: 'USPS', ...row, enabled: false, failingOpen: 563 }] }), null);
  assert.equal(
    fulfilledSyncWarning({ carriers: [{ carrier: 'UPS', ...row, configFault: true, failingOpen: 150 }] }),
    'UPS sync failing since Oct 5, 2:31 PM — statuses may be behind',
  );
  assert.equal(
    fulfilledSyncWarning({
      carriers: [
        { carrier: 'UPS', ...row, failingOpen: 2 },
        { carrier: 'FEDEX', ...row, failingOpen: 294, lastOkAt: null },
      ],
    }),
    'UPS sync failing since Oct 5, 2:31 PM · FedEx sync failing — statuses may be behind',
  );
});
