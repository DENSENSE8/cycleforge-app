import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cartonAspectCounts,
  lineAspectCounts,
  type AspectCountsDeps,
} from './photo-aspect-counts';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-0000000000aa' as OrgId;

interface Call {
  orgId: OrgId;
  sql: string;
  params: unknown[];
}

function fakes(rows: Array<{ photo_aspect: string | null; n: string | number }>) {
  const calls: Call[] = [];
  const deps: AspectCountsDeps = {
    query: async (orgId, sql, params) => {
      calls.push({ orgId, sql, params });
      return { rows };
    },
  };
  return { deps, calls };
}

test('groups rows into a per-aspect count map', async () => {
  const { deps } = fakes([
    { photo_aspect: 'shipping_label', n: '1' },
    { photo_aspect: 'packing_material', n: 3 },
  ]);
  assert.deepEqual(await cartonAspectCounts(ORG, 42, deps), {
    shipping_label: 1,
    packing_material: 3,
  });
});

test('a missing aspect is simply absent — never a zero the caller must filter', async () => {
  const { deps } = fakes([{ photo_aspect: 'shipping_label', n: 1 }]);
  const counts = await cartonAspectCounts(ORG, 42, deps);
  assert.equal(counts.box_exterior, undefined);
  assert.equal(counts.shipping_label, 1);
});

test('unclassified rows never inflate an aspect', async () => {
  // NULL means *unclassified evidence*, not *evidence of aspect X*. If a NULL
  // row bucketed anywhere it would complete a step nobody worked.
  const { deps } = fakes([
    { photo_aspect: null, n: 9 },
    { photo_aspect: 'serial', n: 1 },
  ]);
  assert.deepEqual(await lineAspectCounts(ORG, 7, deps), { serial: 1 });
});

test('a value outside the vocabulary is dropped, not coerced to a neighbour', async () => {
  const { deps } = fakes([
    { photo_aspect: 'not_an_aspect', n: 4 },
    { photo_aspect: 'included', n: 2 },
  ]);
  assert.deepEqual(await lineAspectCounts(ORG, 7, deps), { included: 2 });
});

test('non-positive or unparseable counts are dropped', async () => {
  const { deps } = fakes([
    { photo_aspect: 'front', n: '0' },
    { photo_aspect: 'back', n: 'x' },
    { photo_aspect: 'side', n: 2 },
  ]);
  assert.deepEqual(await lineAspectCounts(ORG, 7, deps), { side: 2 });
});

test('carton counts are org-scoped and entity-scoped to RECEIVING', async () => {
  const { deps, calls } = fakes([]);
  await cartonAspectCounts(ORG, 42, deps);
  assert.equal(calls.length, 1, 'one grouped query per open carton — never one per aspect');
  assert.equal(calls[0].orgId, ORG);
  assert.deepEqual(calls[0].params, [ORG, 42]);
  assert.match(calls[0].sql, /l\.entity_type = 'RECEIVING'/);
  assert.match(calls[0].sql, /p\.organization_id = \$1/, 'org-scoped in the predicate too');
  assert.match(calls[0].sql, /photo_aspect IS NOT NULL/);
});

test('line counts are entity-scoped to RECEIVING_LINE', async () => {
  const { deps, calls } = fakes([]);
  await lineAspectCounts(ORG, 7, deps);
  assert.match(calls[0].sql, /l\.entity_type = 'RECEIVING_LINE'/);
  assert.deepEqual(calls[0].params, [ORG, 7]);
});

test('an empty result is an empty map, not a throw', async () => {
  const { deps } = fakes([]);
  assert.deepEqual(await cartonAspectCounts(ORG, 42, deps), {});
});
