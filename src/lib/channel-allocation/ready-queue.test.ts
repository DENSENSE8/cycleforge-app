import test from 'node:test';
import assert from 'node:assert/strict';
import { getReadyQueue, type ReadyQueueDeps } from './ready-queue';

const ORG = '00000000-0000-4000-8000-000000000001';

function fakes(rows: Parameters<ReadyQueueDeps['loadCandidates']> extends (
  ...args: infer _
) => Promise<infer R>
  ? R
  : never) {
  const cap: { orgIds: string[]; limits: number[] } = { orgIds: [], limits: [] };
  const deps: ReadyQueueDeps = {
    loadCandidates: async (orgId, limit) => {
      cap.orgIds.push(orgId);
      cap.limits.push(limit);
      return rows;
    },
  };
  return { deps, cap };
}

test('getReadyQueue overlays dispositions while preserving newest-tested order', async () => {
  const { deps, cap } = fakes([
    {
      testing_result_id: 101,
      entity_id: 1,
      sku: 'SKU-A',
      sku_catalog_id: 10,
      fnsku: 'X1',
      asin: 'B00A',
      title: 'Popular item',
      condition_grade: 'USED_A',
      unit_status: 'TESTED',
      verdict: 'PASS',
      tested_by: 7,
      tested_by_name: 'Alex',
      tested_at: '2026-07-01T00:00:00Z',
      velocity_tier: 'D',
      open_fba_plan_remaining: 4,
      serial_number: 'SN1',
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: false,
    },
    {
      testing_result_id: 102,
      entity_id: 2,
      sku: 'SKU-B',
      sku_catalog_id: 11,
      fnsku: 'X2',
      asin: null,
      title: 'Slow item',
      condition_grade: 'USED_B',
      unit_status: 'GRADED',
      verdict: 'PASS',
      tested_by: 7,
      tested_by_name: 'Alex',
      tested_at: '2026-07-02T00:00:00Z',
      velocity_tier: 'D',
      open_fba_plan_remaining: 0,
      serial_number: 'SN2',
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: false,
    },
  ]);

  const hits = await getReadyQueue(ORG, { limit: 50 }, deps);
  assert.equal(cap.orgIds[0], ORG);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].entityId, 2);
  assert.equal(hits[0].disposition, 'PREBOX_STOCK');
  assert.equal(hits[1].disposition, 'FBA');
  assert.ok(hits[1].reasons.includes('FBA_PLAN_OPEN'));
  assert.equal(hits[1].testedByName, 'Alex');
});

test('getReadyQueue filters by disposition and q', async () => {
  const { deps } = fakes([
    {
      testing_result_id: 201,
      entity_id: 1,
      sku: 'ALPHA',
      sku_catalog_id: null,
      fnsku: null,
      asin: null,
      title: 'Alpha widget',
      condition_grade: null,
      unit_status: 'TESTED',
      verdict: 'PASS',
      tested_by: null,
      tested_by_name: null,
      tested_at: null,
      velocity_tier: 'A',
      open_fba_plan_remaining: 0,
      serial_number: null,
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: false,
    },
    {
      testing_result_id: 202,
      entity_id: 2,
      sku: 'BETA',
      sku_catalog_id: null,
      fnsku: null,
      asin: null,
      title: 'Beta widget',
      condition_grade: null,
      unit_status: 'TESTED',
      verdict: 'PASS',
      tested_by: null,
      tested_by_name: null,
      tested_at: null,
      velocity_tier: 'A',
      open_fba_plan_remaining: 2,
      serial_number: null,
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: false,
    },
  ]);

  const fbaOnly = await getReadyQueue(ORG, { disposition: 'FBA' }, deps);
  assert.equal(fbaOnly.length, 1);
  assert.equal(fbaOnly[0].entityId, 2);

  const qHit = await getReadyQueue(ORG, { q: 'alpha' }, deps);
  assert.equal(qHit.length, 1);
  assert.equal(qHit[0].sku, 'ALPHA');
});

test('getReadyQueue keeps non-allocatable history visible and filters hold verdicts', async () => {
  const { deps } = fakes([
    {
      testing_result_id: 301,
      entity_id: 9,
      sku: 'STAGED',
      sku_catalog_id: null,
      fnsku: 'F-STAGED',
      asin: null,
      title: 'Already staged',
      condition_grade: 'USED_A',
      unit_status: 'TESTED',
      verdict: 'PASS',
      tested_by: 4,
      tested_by_name: 'Morgan',
      tested_at: '2026-07-03T00:00:00Z',
      velocity_tier: 'B',
      open_fba_plan_remaining: 1,
      serial_number: 'SN9',
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: true,
    },
    {
      testing_result_id: 302,
      entity_id: 10,
      sku: 'FAILED',
      sku_catalog_id: null,
      fnsku: null,
      asin: null,
      title: 'Needs repair',
      condition_grade: null,
      unit_status: 'ON_HOLD',
      verdict: 'TESTING_FAILED',
      tested_by: 4,
      tested_by_name: 'Morgan',
      tested_at: '2026-07-04T00:00:00Z',
      velocity_tier: null,
      open_fba_plan_remaining: 0,
      serial_number: 'SN10',
      unit_uid: null,
      has_active_order_allocation: false,
      has_fba_link: false,
    },
  ]);

  const all = await getReadyQueue(ORG, {}, deps);
  assert.equal(all.length, 2);
  assert.equal(all[0].allocationState, 'NOT_READY');
  assert.equal(all[0].disposition, 'HOLD');
  assert.equal(all[1].allocationState, 'FBA_STAGED');
  assert.equal(all[1].disposition, null);

  const hold = await getReadyQueue(ORG, { disposition: 'HOLD' }, deps);
  assert.deepEqual(hold.map((hit) => hit.entityId), [10]);
});
