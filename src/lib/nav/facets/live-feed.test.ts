import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavFacets, type NavFacetsDeps } from '@/lib/nav/facets/service';
import { NAV_FACET_GROUPS, isNavFacetContext } from '@/lib/nav/facets/contexts';
import type { LiveFeedCountReader } from '@/lib/nav/facets/live-feed';
import { liveFeedStatusesOf } from '@/lib/live-feed/statuses';
import type { LiveFeedFilters } from '@/lib/live-feed/types';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org_test' as OrgId;
const CHANNEL = { id: 'channel', label: 'Channel', param: 'channel', multi: false };
const CARRIER = { id: 'carrier', label: 'Carrier', param: 'carrier', multi: false };

function deps(reader: LiveFeedCountReader): NavFacetsDeps {
  return {
    run: async () => [],
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    liveFeedCounts: reader,
  };
}

test('one facet context per direction view; Channel on both, Carrier outbound; no lane contexts', () => {
  assert.deepEqual(NAV_FACET_GROUPS['live-feed.outbound'], [CHANNEL, CARRIER]);
  assert.deepEqual(NAV_FACET_GROUPS['live-feed.inbound'], [CHANNEL]);
  for (const gone of ['live-feed.out-board', 'live-feed.in-board', 'live-feed.out-scanned-out', 'live-feed.in-docked']) {
    assert.equal(isNavFacetContext(gone), false, gone);
  }
});

test('outbound: every lane counted under the page params; total = visible lanes; Carrier summed over carrier lanes', async () => {
  const seen: Array<{ filters: LiveFeedFilters; only: readonly string[] | undefined }> = [];
  const reader: LiveFeedCountReader = async (_org, filters, _perms, only) => {
    seen.push({ filters, only });
    return {
      'out-to-pack': { count: 4, carriers: [{ key: 'USPS', count: 4 }], channels: [{ key: 'online', count: 3 }, { key: 'in_person', count: 1 }] },
      'out-scanned-out': { count: 6, carriers: [{ key: 'UPS', count: 6 }, { key: 'USPS', count: 2 }], channels: [{ key: 'online', count: 6 }] },
      'out-sold-in-person': { count: 0, carriers: [], channels: [{ key: 'in_person', count: 2 }] },
    };
  };
  // The page URL names a lane (an old link): the context decides — the Board counts every lane.
  const params = new URLSearchParams({ status: 'out-packed', lens: 'scanned_out', from: '2026-09-30', channel: 'online', carrier: 'UPS' });
  const res = await getNavFacets({ orgId: ORG, permissions: new Set(['packing.view']) }, 'live-feed.outbound', params, deps(reader));
  assert.ok(res.ok);
  // Online pick: Sold in person is outside it and drops from the total and the carriers.
  assert.equal(res.body.total, 10);
  assert.deepEqual(res.body.groups, [
    {
      id: 'channel',
      label: 'Channel',
      param: 'channel',
      options: [
        { value: 'online', label: 'Online', count: 9 },
        { value: 'in_person', label: 'In person', count: 3 },
      ],
    },
    {
      id: 'carrier',
      label: 'Carrier',
      param: 'carrier',
      options: [
        { value: 'UPS', label: 'UPS', count: 6 },
        { value: 'USPS', label: 'USPS', count: 6 },
      ],
    },
  ]);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].only, liveFeedStatusesOf('outbound').map((s) => s.id));
  assert.equal(seen[0].filters.dir, 'outbound');
  assert.equal(seen[0].filters.status, null);
  assert.equal(seen[0].filters.lens, 'scanned_out');
  assert.equal(seen[0].filters.from, '2026-09-30');
  assert.equal(seen[0].filters.carrier, 'UPS');
});

test('the range always applies: no day in the URL counts today', async () => {
  let filters: LiveFeedFilters | null = null;
  const reader: LiveFeedCountReader = async (_org, f) => {
    filters = f;
    return {};
  };
  await getNavFacets({ orgId: ORG, permissions: new Set(['packing.view']) }, 'live-feed.outbound', new URLSearchParams(), deps(reader));
  assert.ok(filters);
  assert.match((filters as LiveFeedFilters).from, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((filters as LiveFeedFilters).from, (filters as LiveFeedFilters).to);
});

test('inbound reads its direction and its lenses, and is refused without receiving.view', async () => {
  let dir: string | null = null;
  let lens: string | null = null;
  const reader: LiveFeedCountReader = async (_org, filters) => {
    dir = filters.dir;
    lens = filters.lens;
    return { 'in-docked': { count: 3, carriers: [], channels: [{ key: 'online', count: 3 }] } };
  };
  const ok = await getNavFacets(
    { orgId: ORG, permissions: new Set(['receiving.view']) },
    'live-feed.inbound',
    new URLSearchParams({ lens: 'received' }),
    deps(reader),
  );
  assert.ok(ok.ok);
  assert.equal(ok.body.total, 3);
  assert.equal(dir, 'inbound');
  assert.equal(lens, 'received');
  const refused = await getNavFacets({ orgId: ORG, permissions: new Set(['packing.view']) }, 'live-feed.inbound', new URLSearchParams(), deps(reader));
  assert.equal(refused.ok, false);
});
