import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultLiveFeedFilters,
  normalizeLiveFeedFilters,
  liveFeedApiHref,
  liveFeedBoardHref,
  liveFeedHref,
  liveFeedSearchParams,
  liveFeedTrackingHref,
  readLiveFeedFilters,
} from './route';
import { LiveFeedQuery } from '@/lib/schemas/live-feed';
import type { LiveFeedFilters, LiveFeedStatusFilters } from './types';

const TODAY = '2026-10-03';

const NARROWED: LiveFeedStatusFilters = {
  dir: 'outbound',
  status: 'out-in-transit',
  channel: 'online',
  staff: 7,
  lens: 'scanned_out',
  from: '2026-09-28',
  to: '2026-09-30',
  timeFrom: '09:00',
  timeTo: '17:45',
  carrier: 'UPS',
  q: '1Z999',
  carry: true,
  page: 3,
};

test('the bare URL is the Outbound Board, today by entered lane: the range always applies', () => {
  const bare = readLiveFeedFilters(new URLSearchParams(), TODAY);
  assert.deepEqual(bare, defaultLiveFeedFilters('outbound', TODAY));
  assert.deepEqual(bare, {
    dir: 'outbound',
    status: null,
    channel: null,
    staff: null,
    lens: 'entered',
    from: TODAY,
    to: TODAY,
    timeFrom: null,
    timeTo: null,
    carrier: null,
    q: null,
    carry: false,
    page: 1,
  });
  assert.equal(liveFeedHref(bare), `/operations/live-feed?from=${TODAY}&to=${TODAY}`);
  assert.equal(liveFeedHref(defaultLiveFeedFilters('inbound', TODAY)), `/operations/live-feed?dir=inbound&from=${TODAY}&to=${TODAY}`);
});

test('URL round trip: every filter survives write → read; the page URL never carries a lane or a page', () => {
  const api = liveFeedApiHref(NARROWED);
  assert.equal(
    api,
    '/api/live-feed?status=out-in-transit&channel=online&staff=7&lens=scanned_out&from=2026-09-28&to=2026-09-30&timeFrom=09%3A00&timeTo=17%3A45&carrier=UPS&q=1Z999&carry=1&page=3',
  );
  assert.deepEqual(readLiveFeedFilters(new URL(api, 'http://x').searchParams, TODAY), NARROWED);
  const page = liveFeedHref(NARROWED);
  assert.doesNotMatch(page, /status=|page=/);
  assert.deepEqual(readLiveFeedFilters(new URL(page, 'http://x').searchParams, TODAY), { ...NARROWED, status: null, page: 1 });
  const inbound: LiveFeedFilters = { ...defaultLiveFeedFilters('inbound', TODAY), lens: 'unboxed', channel: 'in_person', from: '2026-09-30', to: '2026-09-30' };
  assert.deepEqual(readLiveFeedFilters(new URL(liveFeedHref(inbound), 'http://x').searchParams, TODAY), inbound);
});

test('lens: one the direction offers; another direction’s or a junk one is entered', () => {
  assert.equal(normalizeLiveFeedFilters({ lens: 'packed' }, TODAY).lens, 'packed');
  assert.equal(normalizeLiveFeedFilters({ dir: 'inbound', lens: 'packed' }, TODAY).lens, 'entered');
  assert.equal(normalizeLiveFeedFilters({ dir: 'inbound', lens: 'RECEIVED' }, TODAY).lens, 'received');
  assert.equal(normalizeLiveFeedFilters({ lens: 'unboxed' }, TODAY).lens, 'entered');
  assert.equal(normalizeLiveFeedFilters({ lens: 'sorted' }, TODAY).lens, 'entered');
});

test('status (API only): ONE lane of the direction and channel; anything else is the Board', () => {
  assert.equal(normalizeLiveFeedFilters({ dir: 'inbound', status: 'out-packed' }, TODAY).status, null);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-packed,out-delivered' }, TODAY).status, null);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-with-carrier' }, TODAY).status, null);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-sold-in-person', channel: 'online' }, TODAY).status, null);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-scanned-out', channel: 'in_person' }, TODAY).status, null);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-packed', channel: 'in_person' }, TODAY).status, 'out-packed');
  assert.equal(normalizeLiveFeedFilters({ dir: 'all' }, TODAY).dir, 'outbound');
});

test('channel: online / in_person, anything else is both', () => {
  assert.equal(normalizeLiveFeedFilters({ channel: 'IN_PERSON' }, TODAY).channel, 'in_person');
  assert.equal(normalizeLiveFeedFilters({ channel: 'store' }, TODAY).channel, null);
});

test('dates: never null — no day is today; one day is a one-day range; reversed days and same-day times swap', () => {
  const one = normalizeLiveFeedFilters({ from: '2026-09-30' }, TODAY);
  assert.deepEqual([one.from, one.to], ['2026-09-30', '2026-09-30']);
  assert.equal(normalizeLiveFeedFilters({ to: '2026-09-30' }, TODAY).from, '2026-09-30');
  const reversed = normalizeLiveFeedFilters({ from: '2026-10-02', to: '2026-09-30' }, TODAY);
  assert.deepEqual([reversed.from, reversed.to], ['2026-09-30', '2026-10-02']);
  const times = normalizeLiveFeedFilters({ from: '2026-09-30', timeFrom: '17:00', timeTo: '09:00' }, TODAY);
  assert.deepEqual([times.timeFrom, times.timeTo], ['09:00', '17:00']);
  const junk = normalizeLiveFeedFilters({ from: 'yesterday', timeFrom: '25:00' }, TODAY);
  assert.deepEqual([junk.from, junk.to, junk.timeFrom], [TODAY, TODAY, null]);
});

test('carry, paging, staff, carrier, find normalize', () => {
  const f = normalizeLiveFeedFilters({ carry: 'yes', page: '0', staff: '-2', carrier: ' fedex ', q: '  ' }, TODAY);
  assert.equal(f.carry, false);
  assert.equal(f.page, 1);
  assert.equal(f.staff, null);
  assert.equal(f.carrier, 'FEDEX');
  assert.equal(f.q, null);
  assert.equal(normalizeLiveFeedFilters({ carry: '1' }, TODAY).carry, true);
  assert.equal(normalizeLiveFeedFilters({ status: 'out-packed', page: 4 }, TODAY).page, 4);
  // The Board has no pages.
  assert.equal(normalizeLiveFeedFilters({ page: 4 }, TODAY).page, 1);
});

test('Copy all and Board reads: the same filters without the page (and, on the Board, the lane)', () => {
  assert.equal(liveFeedTrackingHref(NARROWED), `/api/live-feed/tracking?${liveFeedSearchParams({ ...NARROWED, page: 1 }).toString()}`);
  assert.equal(
    liveFeedBoardHref(NARROWED),
    '/api/live-feed/board?channel=online&staff=7&lens=scanned_out&from=2026-09-28&to=2026-09-30&timeFrom=09%3A00&timeTo=17%3A45&carrier=UPS&q=1Z999&carry=1',
  );
  assert.equal(liveFeedBoardHref(defaultLiveFeedFilters('outbound', TODAY)), `/api/live-feed/board?from=${TODAY}&to=${TODAY}`);
});

test('API query: lens and carry validate; sort is gone', () => {
  assert.ok(LiveFeedQuery.safeParse({ lens: 'delivered', carry: '1', from: '2026-09-30' }).success);
  assert.ok(!LiveFeedQuery.safeParse({ lens: 'shipped' }).success);
  assert.ok(!LiveFeedQuery.safeParse({ sort: 'urgent' }).success);
  assert.ok(!LiveFeedQuery.safeParse({ carry: 'maybe' }).success);
});
