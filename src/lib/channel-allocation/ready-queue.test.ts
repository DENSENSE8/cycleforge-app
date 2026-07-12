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

test('getReadyQueue scores open-plan units as FBA first', async () => {
  const { deps, cap } = fakes([
    {
      entity_id: 1,
      sku: 'SKU-A',
      sku_catalog_id: 10,
      fnsku: 'X1',
      asin: 'B00A',
      title: 'Popular item',
      condition_grade: 'USED_A',
      unit_status: 'TESTED',
      tested_at: '2026-07-01T00:00:00Z',
      velocity_tier: 'D',
      open_fba_plan_remaining: 4,
      serial_number: 'SN1',
      unit_uid: null,
    },
    {
      entity_id: 2,
      sku: 'SKU-B',
      sku_catalog_id: 11,
      fnsku: 'X2',
      asin: null,
      title: 'Slow item',
      condition_grade: 'USED_B',
      unit_status: 'GRADED',
      tested_at: '2026-07-02T00:00:00Z',
      velocity_tier: 'D',
      open_fba_plan_remaining: 0,
      serial_number: 'SN2',
      unit_uid: null,
    },
  ]);

  const hits = await getReadyQueue(ORG, { limit: 50 }, deps);
  assert.equal(cap.orgIds[0], ORG);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].entityId, 1);
  assert.equal(hits[0].disposition, 'FBA');
  assert.ok(hits[0].reasons.includes('FBA_PLAN_OPEN'));
  assert.equal(hits[1].disposition, 'PREBOX_STOCK');
});

test('getReadyQueue filters by disposition and q', async () => {
  const { deps } = fakes([
    {
      entity_id: 1,
      sku: 'ALPHA',
      sku_catalog_id: null,
      fnsku: null,
      asin: null,
      title: 'Alpha widget',
      condition_grade: null,
      unit_status: 'TESTED',
      tested_at: null,
      velocity_tier: 'A',
      open_fba_plan_remaining: 0,
      serial_number: null,
      unit_uid: null,
    },
    {
      entity_id: 2,
      sku: 'BETA',
      sku_catalog_id: null,
      fnsku: null,
      asin: null,
      title: 'Beta widget',
      condition_grade: null,
      unit_status: 'TESTED',
      tested_at: null,
      velocity_tier: 'A',
      open_fba_plan_remaining: 2,
      serial_number: null,
      unit_uid: null,
    },
  ]);

  const fbaOnly = await getReadyQueue(ORG, { disposition: 'FBA' }, deps);
  assert.equal(fbaOnly.length, 1);
  assert.equal(fbaOnly[0].entityId, 2);

  const qHit = await getReadyQueue(ORG, { q: 'alpha' }, deps);
  assert.equal(qHit.length, 1);
  assert.equal(qHit[0].sku, 'ALPHA');
});
