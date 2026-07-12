import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMasterPlanOutline,
  ticketToTaskStatus,
  syncMasterPlanToOpsPlans,
  MASTER_PLAN_OPS_TITLE,
  type BridgeDeps,
} from './ops-plans-bridge';

const MDX = `# Master plan

## Loop bring-up (ALP)

<TicketStatus status="deployed" ticketId="ALP-0.3" resolutionCommit="abc1234" />
<TicketStatus status="in-progress" ticketId="ALP-1.1" href="/docs/todo/agentic-loop-master-plan.md" />

## Product roadmap tickets

<TicketStatus status="pending" ticketId="P1-TRACE-02" href="/docs/CYCLE-FORGE-ROADMAP" />
<TicketStatus status="done" ticketId="BAD-1" />
`;

test('buildMasterPlanOutline groups tickets under their ## heading', () => {
  const outline = buildMasterPlanOutline(MDX);
  assert.deepEqual(
    outline.map((s) => [s.heading, s.tickets.map((t) => t.ticketId)]),
    [
      ['Loop bring-up (ALP)', ['ALP-0.3', 'ALP-1.1']],
      ['Product roadmap tickets', ['P1-TRACE-02', 'BAD-1']],
    ],
  );
});

test('tickets before any heading land in the fallback section', () => {
  const outline = buildMasterPlanOutline('<TicketStatus status="pending" ticketId="X-1" />');
  assert.equal(outline[0].heading, 'Plan');
  assert.equal(outline[0].tickets[0].ticketId, 'X-1');
});

test('ticketToTaskStatus maps the locked enum (invalid → open, never hidden)', () => {
  assert.equal(ticketToTaskStatus('pending'), 'open');
  assert.equal(ticketToTaskStatus('in-progress'), 'in_progress');
  assert.equal(ticketToTaskStatus('deployed'), 'done');
  assert.equal(ticketToTaskStatus(null), 'open');
});

function fakeTx(existingPlanId: string | null) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const deps: BridgeDeps = {
    runTx: async (_orgId, fn) =>
      fn({
        query: async (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          if (/SELECT id FROM ops_plans/.test(sql)) {
            return { rows: existingPlanId ? [{ id: existingPlanId }] : [], rowCount: existingPlanId ? 1 : 0 };
          }
          if (/INSERT INTO ops_plans/.test(sql)) return { rows: [{ id: 'plan-new' }], rowCount: 1 };
          if (/SELECT id FROM ops_plan_phases/.test(sql)) return { rows: [], rowCount: 0 };
          if (/INSERT INTO ops_plan_phases/.test(sql)) return { rows: [{ id: `phase-${queries.length}` }], rowCount: 1 };
          if (/UPDATE ops_plan_tasks t/.test(sql)) return { rows: [], rowCount: 2 };
          return { rows: [], rowCount: 1 };
        },
      }),
    publish: async (payload) => {
      published.push(payload);
    },
  };
  const published: unknown[] = [];
  return { deps, queries, published };
}

test('sync creates the plan when missing, upserts every ticket, cancels removed, publishes', async () => {
  const { deps, queries, published } = fakeTx(null);
  const res = await syncMasterPlanToOpsPlans('11111111-2222-3333-4444-555555555555', MDX, deps);

  assert.equal(res.createdPlan, true);
  assert.equal(res.planId, 'plan-new');
  assert.equal(res.upsertedTasks, 4);
  assert.equal(res.canceledTasks, 2);

  const planInsert = queries.find((q) => /INSERT INTO ops_plans/.test(q.sql));
  assert.ok(planInsert && planInsert.params[1] === MASTER_PLAN_OPS_TITLE);

  const taskUpserts = queries.filter((q) => /INSERT INTO ops_plan_tasks/.test(q.sql));
  assert.equal(taskUpserts.length, 4);
  const byKey = Object.fromEntries(taskUpserts.map((q) => [q.params[6], q.params]));
  assert.equal(byKey['master-plan:ALP-0.3'][3], 'done');
  assert.equal(byKey['master-plan:ALP-1.1'][3], 'in_progress');
  assert.equal(byKey['master-plan:P1-TRACE-02'][3], 'open');
  assert.equal(byKey['master-plan:BAD-1'][3], 'open');
  assert.match(String(byKey['master-plan:BAD-1'][4]), /INVALID status "done"/);
  assert.match(String(byKey['master-plan:ALP-0.3'][4]), /Resolved in abc1234/);

  // Removed-ticket cancel is scoped to our key prefix and the seen-key list.
  const cancel = queries.find((q) => /UPDATE ops_plan_tasks t/.test(q.sql));
  assert.ok(cancel);
  assert.equal(cancel.params[2], 'master-plan:%');
  assert.deepEqual(
    (cancel.params[3] as string[]).sort(),
    ['master-plan:ALP-0.3', 'master-plan:ALP-1.1', 'master-plan:BAD-1', 'master-plan:P1-TRACE-02'],
  );

  assert.equal(published.length, 1);
  assert.deepEqual(published[0], {
    organizationId: '11111111-2222-3333-4444-555555555555',
    planId: 'plan-new',
    event: 'plan_updated',
    source: 'master-plan-bridge',
  });
});

test('sync reuses an existing projected plan (idempotent identity)', async () => {
  const { deps, queries } = fakeTx('plan-existing');
  const res = await syncMasterPlanToOpsPlans('11111111-2222-3333-4444-555555555555', MDX, deps);
  assert.equal(res.createdPlan, false);
  assert.equal(res.planId, 'plan-existing');
  assert.ok(!queries.some((q) => /INSERT INTO ops_plans\b/.test(q.sql)), 'no duplicate plan insert');
});
