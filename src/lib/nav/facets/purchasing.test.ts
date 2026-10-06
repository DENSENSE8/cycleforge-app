import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { purchasingFacets } from '@/lib/nav/facets/purchasing';

const FACETS = {
  sources: [
    { value: 'zoho', label: 'Zoho', count: 7 },
    { value: 'ebay', label: 'eBay', count: 2 },
  ],
  vendors: [
    { value: 'Acme', label: 'Acme', count: 5 },
    { value: 'Bolt Co', label: 'Bolt Co', count: 4 },
  ],
  unboxedBy: [{ id: 3, name: 'Ann', count: 1 }],
};

function facets(query: string, answer: { total: number; facets: typeof FACETS } | null = { total: 9, facets: FACETS }) {
  const asked: URLSearchParams[] = [];
  const body = purchasingFacets(new URLSearchParams(query), async (apiParams) => {
    asked.push(apiParams);
    return answer;
  });
  return { body, asked };
}

test('Purchasing declares Source and a searchable Vendor — no status group (the body owns the chips)', () => {
  assert.deepEqual(
    NAV_FACET_GROUPS.purchasing.map((group) => [group.param, group.multi, group.searchable === true]),
    [
      ['source', false, false],
      ['vendor', false, true],
    ],
  );
});

test('asks the sheet’s own read with the sheet’s own API params, and maps its facets', async () => {
  const { body, asked } = facets('axis=delivered&from=2026-07-01&vendor=Acme&colsort=po&coldir=asc&recon=waiting&find=PO-9');
  const res = await body;
  const api = asked[0]!;
  assert.equal(api.get('axis'), 'delivered');
  assert.equal(api.get('from'), '2026-07-01');
  assert.equal(api.get('vendor'), 'Acme');
  assert.equal(api.get('sort'), 'po');
  assert.equal(api.get('dir'), 'asc');
  assert.equal(api.get('find'), 'PO-9');
  assert.equal(api.get('status'), null, 'status narrows client-side');
  assert.equal(res.context, 'purchasing');
  assert.equal(res.total, 9);
  assert.deepEqual(
    res.groups.map((group) => [group.id, group.options.map((option) => [option.value, option.count])]),
    [
      ['source', [['zoho', 7], ['ebay', 2]]],
      ['vendor', [['Acme', 5], ['Bolt Co', 4]]],
    ],
  );
});

test('a picked value the window no longer holds still shows, at 0', async () => {
  const res = await facets('vendor=Gone+Ltd&source=ebay').body;
  const vendor = res.groups.find((group) => group.id === 'vendor')!;
  assert.deepEqual(vendor.options.at(-1), { value: 'Gone Ltd', label: 'Gone Ltd', count: 0 });
  const source = res.groups.find((group) => group.id === 'source')!;
  assert.equal(source.options.filter((option) => option.value === 'ebay').length, 1, 'a held value is never doubled');
});

test('a refused read answers empty groups, keeping the picked value', async () => {
  const res = await facets('vendor=Acme', null).body;
  assert.equal(res.total, 0);
  assert.deepEqual(res.groups.find((group) => group.id === 'source')?.options, []);
  assert.deepEqual(res.groups.find((group) => group.id === 'vendor')?.options, [{ value: 'Acme', label: 'Acme', count: 0 }]);
});
