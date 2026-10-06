import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveFeedFilters } from '@/lib/live-feed/route';
import { getNavFacets, type NavFacetsDeps } from '@/lib/nav/facets/service';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-live-feed' as OrgId;

function deps(seen: LiveFeedFilters[]): NavFacetsDeps {
  return {
    run: async () => {
      throw new Error('the live feed counts through its own loader');
    },
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    supportRows: async () => [],
    liveFeedFacets: async (orgId, filters) => {
      assert.equal(orgId, ORG);
      seen.push(filters);
      return {
        carrier: [{ value: 'USPS', label: 'USPS', count: 7 }, { value: 'UPS', label: 'UPS', count: 3 }],
        channel: [{ value: 'ebay', label: 'eBay', count: 4 }, { value: 'amazon', label: 'Amazon', count: 2 }],
      };
    },
  };
}

test('live-feed facets: the board loader answers with the URL filters; Carrier · Channel groups, labels from the loader', async () => {
  const seen: LiveFeedFilters[] = [];
  const result = await getNavFacets(
    { orgId: ORG, permissions: new Set(['packing.view']) },
    'live-feed',
    new URLSearchParams({ carrier: 'usps', staff: '4' }),
    deps(seen),
  );
  assert.ok(result.ok);
  assert.deepEqual(seen[0], { carriers: ['USPS'], channels: null, staffId: 4, sorts: null });
  assert.equal(result.body.context, 'live-feed');
  assert.deepEqual(
    result.body.groups.map((group) => [group.id, group.param, group.options.map((o) => [o.value, o.label, o.count])]),
    [
      ['carrier', 'carrier', [['USPS', 'USPS', 7], ['UPS', 'UPS', 3]]],
      ['channel', 'channel', [['ebay', 'eBay', 4], ['amazon', 'Amazon', 2]]],
    ],
  );
  // Carrier filtered → the selected carriers' members.
  assert.equal(result.body.total, 7);
});

test('live-feed facets need packing.view', async () => {
  const result = await getNavFacets({ orgId: ORG, permissions: new Set(['orders.view']) }, 'live-feed', new URLSearchParams(), deps([]));
  assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'packing.view' });
});
