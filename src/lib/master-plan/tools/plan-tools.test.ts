import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPlanTools, type PlanToolsDeps, type PlanToolsCtx } from './plan-tools';
import { createMasterPlanYDoc, getMasterPlanText, readMasterPlan } from '../doc';
import { scanTicketStatuses } from '../ticket-status';

const SAMPLE = `# Plan

<TicketStatus status="pending" ticketId="ALP-3.4" href="/docs/todo/agentic-loop-master-plan.md" />
<TicketStatus status="in-progress" ticketId="P1-TRACE-02" />
`;

function fakes(initialMdx = SAMPLE) {
  const doc = createMasterPlanYDoc();
  getMasterPlanText(doc).insert(0, initialMdx);
  const audits: unknown[] = [];
  const mutatedHooks: string[] = [];
  const withDocCalls: string[] = [];
  const deps: PlanToolsDeps = {
    withDoc: async (orgId, fn) => {
      withDocCalls.push(orgId);
      return { result: fn(doc), seeded: false };
    },
    audit: async (entry) => {
      audits.push(entry);
    },
    onMutated: (_ctx, mdx) => {
      mutatedHooks.push(mdx);
    },
  };
  const ctx: PlanToolsCtx = { orgId: '11111111-2222-3333-4444-555555555555', staffId: 7 };
  return { doc, deps, ctx, audits, mutatedHooks, withDocCalls };
}

type ExecutableTool = { execute: (input: unknown, opts: unknown) => Promise<unknown> };
const run = (t: unknown, input: unknown) => (t as ExecutableTool).execute(input, {});

test('read_master_plan returns mdx + rollup + per-ticket rows', async () => {
  const { deps, ctx, withDocCalls } = fakes();
  const tools = createPlanTools(ctx, deps);
  const out = (await run(tools.read_master_plan, {})) as {
    mdx: string;
    rollup: { total: number; pending: number };
    tickets: Array<{ ticketId: string; status: string }>;
  };
  assert.equal(out.mdx, SAMPLE);
  assert.equal(out.rollup.total, 2);
  assert.equal(out.rollup.pending, 1);
  assert.deepEqual(
    out.tickets.map((t) => t.ticketId),
    ['ALP-3.4', 'P1-TRACE-02'],
  );
  assert.deepEqual(withDocCalls, [ctx.orgId], 'doc session opened for the caller org only');
});

test('mutate_master_plan flips a ticket, audits, and fires the onMutated hook', async () => {
  const { doc, deps, ctx, audits, mutatedHooks } = fakes();
  const tools = createPlanTools(ctx, deps);
  const out = (await run(tools.mutate_master_plan, {
    action: 'set_ticket_status',
    ticketId: 'ALP-3.4',
    status: 'deployed',
    resolutionCommit: 'abc1234',
  })) as { ok: boolean; previousStatus: string; changed: boolean };

  assert.equal(out.ok, true);
  assert.equal(out.previousStatus, 'pending');
  assert.equal(out.changed, true);

  const ticket = scanTicketStatuses(readMasterPlan(doc)).find((t) => t.ticketId === 'ALP-3.4');
  assert.equal(ticket?.status, 'deployed');
  assert.equal(ticket?.resolutionCommit, 'abc1234');
  assert.equal(ticket?.href, '/docs/todo/agentic-loop-master-plan.md', 'other attrs preserved');

  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0], {
    orgId: ctx.orgId,
    staffId: 7,
    ticketId: 'ALP-3.4',
    from: 'pending',
    to: 'deployed',
    resolutionCommit: 'abc1234',
  });
  assert.equal(mutatedHooks.length, 1);
  assert.ok(mutatedHooks[0].includes('status="deployed"'));
});

test('mutate_master_plan on an unknown ticket returns ticket_not_found and does NOT audit', async () => {
  const { deps, ctx, audits, mutatedHooks } = fakes();
  const tools = createPlanTools(ctx, deps);
  const out = (await run(tools.mutate_master_plan, {
    action: 'set_ticket_status',
    ticketId: 'NOPE-9',
    status: 'deployed',
  })) as { ok: boolean; error?: string };
  assert.equal(out.ok, false);
  assert.equal(out.error, 'ticket_not_found');
  assert.equal(audits.length, 0);
  assert.equal(mutatedHooks.length, 0);
});

test('mutate_master_plan no-op (same status) skips audit + hook', async () => {
  const { deps, ctx, audits, mutatedHooks } = fakes();
  const tools = createPlanTools(ctx, deps);
  const out = (await run(tools.mutate_master_plan, {
    action: 'set_ticket_status',
    ticketId: 'P1-TRACE-02',
    status: 'in-progress',
  })) as { ok: boolean; changed: boolean };
  assert.equal(out.ok, true);
  assert.equal(out.changed, false);
  assert.equal(audits.length, 0);
  assert.equal(mutatedHooks.length, 0);
});

test('input schema rejects out-of-enum statuses (contract enforcement)', async () => {
  const { deps, ctx } = fakes();
  const tools = createPlanTools(ctx, deps);
  const schema = (tools.mutate_master_plan as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } })
    .inputSchema;
  assert.equal(schema.safeParse({ action: 'set_ticket_status', ticketId: 'X', status: 'done' }).success, false);
  assert.equal(schema.safeParse({ action: 'set_ticket_status', ticketId: 'X', status: 'blocked' }).success, false);
  assert.equal(schema.safeParse({ action: 'set_ticket_status', ticketId: 'X', status: 'deployed' }).success, true);
  assert.equal(
    schema.safeParse({ action: 'set_ticket_status', ticketId: 'X', status: 'deployed', resolutionCommit: 'zzz' }).success,
    false,
    'non-SHA resolutionCommit rejected',
  );
});
