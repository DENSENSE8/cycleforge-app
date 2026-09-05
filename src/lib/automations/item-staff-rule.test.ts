/**
 * DB-free tests for the "always this staff for this product" rule writer.
 * A scripted fake client captures every statement; asserts the rule document
 * matches the bulk overlay's, that both slots are stamped on pending orders,
 * and that each write states the inverse the chokepoint reverts with.
 * Run: npm run test:automations (or tsx --test src/lib/automations/*.test.ts)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteItemStaffRule, upsertItemStaffRule } from './item-staff-rule';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;

type Q = { text: string; params: ReadonlyArray<unknown> };

function fakeClient(script: (text: string, params: ReadonlyArray<unknown>) => Array<Record<string, unknown>>) {
  const queries: Q[] = [];
  const client = {
    async query(text: string, params: ReadonlyArray<unknown> = []) {
      queries.push({ text, params });
      const rows = script(text, params);
      return { rows, rowCount: rows.length };
    },
  };
  return { client: client as never, queries };
}

const STAFF_OK = (text: string, params: ReadonlyArray<unknown>) =>
  text.includes('FROM staff') ? (params[1] as number[]).map((id) => ({ id })) : [];

test('creates the rule with TEST + PACK actions and stamps every pending order', async () => {
  const { client, queries } = fakeClient((text, params) => {
    if (text.includes('FROM staff')) return STAFF_OK(text, params);
    if (text.includes('FROM automation_rules')) return []; // no active rule yet
    if (text.includes('INSERT INTO automation_rules')) return [{ id: 91 }];
    if (text.includes('FROM orders')) return [{ id: 13599 }, { id: 13600 }];
    return [];
  });
  const assigned: Array<[number, string, number | null]> = [];
  const out = await upsertItemStaffRule(
    client,
    ORG,
    { itemNumber: 'b07zy7-dwt6', techStaffId: 4, packerStaffId: 4 },
    9,
    {
      assignOrderWork: async (org, orderId, workType, staffId, c) => {
        assert.equal(org, ORG);
        assert.equal(c, client, 'assignment rides the SAME transaction client');
        assigned.push([orderId, workType, staffId]);
      },
    },
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.outcome, 'created');
  assert.equal(out.ruleId, 91);
  assert.equal(out.itemNumber, 'B07ZY7DWT6', 'normalized the same way the rule index does');
  assert.deepEqual(out.assignedOrderIds, [13599, 13600]);
  assert.deepEqual(out.inverse, { kind: 'automation_rule.delete', payload: { ruleId: 91 } });

  const insert = queries.find((q) => q.text.includes('INSERT INTO automation_rules'))!;
  assert.equal(insert.params[0], ORG);
  assert.deepEqual(JSON.parse(String(insert.params[3])), { item_number: 'B07ZY7DWT6' });
  assert.deepEqual(JSON.parse(String(insert.params[4])), [
    { type: 'assign_work', work_type: 'TEST', staff_id: 4 },
    { type: 'assign_work', work_type: 'PACK', staff_id: 4 },
  ]);
  assert.equal(insert.params[5], 9, 'created_by is the actor from ctx');

  // Every statement is org-led.
  for (const q of queries) assert.equal(q.params[0], ORG, q.text);
  // Both slots on both pending orders through the shared upsert waist.
  assert.deepEqual(assigned, [
    [13599, 'TEST', 4],
    [13599, 'PACK', 4],
    [13600, 'TEST', 4],
    [13600, 'PACK', 4],
  ]);
  const pendingSweep = queries.find((q) => q.text.includes('FROM orders'))!;
  assert.match(pendingSweep.text, /<> 'shipped'/);
  assert.equal(pendingSweep.params[1], 'B07ZY7DWT6');
});

test('updates an existing rule and states the previous staff pair as the inverse', async () => {
  const { client, queries } = fakeClient((text, params) => {
    if (text.includes('FROM staff')) return STAFF_OK(text, params);
    if (text.includes('FROM automation_rules')) {
      return [{
        id: 40,
        then_json: [
          { type: 'assign_work', work_type: 'TEST', staff_id: 6 },
          { type: 'assign_work', work_type: 'PACK', staff_id: 5 },
        ],
      }];
    }
    return [];
  });
  const out = await upsertItemStaffRule(
    client,
    ORG,
    { itemNumber: 'B07ZY7DWT6', techStaffId: 4, packerStaffId: 4, assignPending: false },
    null,
    { assignOrderWork: async () => assert.fail('assignPending:false must not assign') },
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.outcome, 'updated');
  assert.deepEqual(out.assignedOrderIds, []);
  assert.deepEqual(out.inverse, {
    kind: 'automation_rule.upsert_item_staff',
    payload: { itemNumber: 'B07ZY7DWT6', techStaffId: 6, packerStaffId: 5, assignPending: false },
  });
  assert.ok(queries.some((q) => q.text.includes('UPDATE automation_rules')));
  assert.ok(!queries.some((q) => q.text.includes('INSERT INTO automation_rules')));
  assert.ok(!queries.some((q) => q.text.includes('FROM orders')), 'assignPending:false skips the order sweep');
});

test('refuses a staff id that is not active in this org', async () => {
  const { client } = fakeClient((text) => (text.includes('FROM staff') ? [{ id: 4 }] : []));
  const out = await upsertItemStaffRule(client, ORG, { itemNumber: 'X1', techStaffId: 4, packerStaffId: 999 }, 1);
  assert.deepEqual(out, { ok: false, status: 404, error: 'staff not found or inactive in this org: 999' });
});

test('rejects an empty item number or a non-positive staff id before touching the DB', async () => {
  const { client, queries } = fakeClient(() => []);
  const a = await upsertItemStaffRule(client, ORG, { itemNumber: '  ', techStaffId: 4, packerStaffId: 4 }, 1);
  const b = await upsertItemStaffRule(client, ORG, { itemNumber: 'X1', techStaffId: 0, packerStaffId: 4 }, 1);
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.equal(queries.length, 0);
});

test('delete soft-deletes and hands back the re-create inverse', async () => {
  const { client, queries } = fakeClient((text) =>
    text.includes('UPDATE automation_rules')
      ? [{
          id: 40,
          when_json: { item_number: 'B07ZY7DWT6' },
          then_json: [
            { type: 'assign_work', work_type: 'TEST', staff_id: 4 },
            { type: 'assign_work', work_type: 'PACK', staff_id: 5 },
          ],
        }]
      : [],
  );
  const out = await deleteItemStaffRule(client, ORG, { ruleId: 40 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.itemNumber, 'B07ZY7DWT6');
  assert.deepEqual(out.inverse, {
    kind: 'automation_rule.upsert_item_staff',
    payload: { itemNumber: 'B07ZY7DWT6', techStaffId: 4, packerStaffId: 5, assignPending: false },
  });
  const upd = queries[0];
  assert.match(upd.text, /deleted_at = NOW\(\)/);
  assert.equal(upd.params[0], ORG);
});

test('delete of a missing rule is a 404, not a silent no-op', async () => {
  const { client } = fakeClient(() => []);
  const out = await deleteItemStaffRule(client, ORG, { ruleId: 7 });
  assert.deepEqual(out, { ok: false, status: 404, error: 'automation rule 7 not found' });
});
