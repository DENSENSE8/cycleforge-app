/**
 * DB-free tests for the shared tool dispatch (Ask plan §17, PR 0). No registry,
 * no network: a fake `runTool` stands in for runAssistantTool and hand-built
 * write tools stand in for propose_mutation.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildWriteToolMap, dispatchToolCall, type RunAssistantToolFn, type WriteToolDef } from './dispatch';
import type { AssistantToolCtx } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const OTHER_ORG = '99999999-9999-9999-9999-999999999999';
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set(['assistant.chat', 'studio.manage']),
};

function fakeRunTool() {
  const calls: Array<{ name: string; input: unknown; orgId: string }> = [];
  const runTool: RunAssistantToolFn = async (name, input, ctx) => {
    calls.push({ name, input, orgId: ctx.organizationId });
    return name === 'get_kpis'
      ? { ok: true, data: { shipped: 200 } }
      : { ok: false, code: 'unknown_tool', error: `Unknown tool "${name}"` };
  };
  return { runTool, calls };
}

function writeTool(overrides: Partial<WriteToolDef> = {}) {
  const seen: Array<{ input: unknown; ctx: AssistantToolCtx }> = [];
  const tool: WriteToolDef = {
    name: 'propose_mutation',
    description: 'test write',
    permission: 'assistant.chat',
    inputSchema: z.object({
      target: z.string().min(1),
      // A model may echo an org id into the args; the schema tolerates it and
      // the test below proves it never becomes the org the tool runs under.
      organizationId: z.string().optional(),
    }),
    run: async (input, ctx) => {
      seen.push({ input, ctx });
      return { ok: true, applied: input.target };
    },
    ...overrides,
  };
  return { tool, seen };
}

test('a name outside the write map goes to the registry runner with the auth ctx', async () => {
  const { runTool, calls } = fakeRunTool();
  const out = await dispatchToolCall('get_kpis', { rangeDays: 7 }, CTX, new Map(), runTool);
  assert.deepEqual(out, { ok: true, data: { shipped: 200 } });
  assert.deepEqual(calls, [{ name: 'get_kpis', input: { rangeDays: 7 }, orgId: ORG }]);
});

test('an invented name is the registry\'s unknown_tool, not a dispatch throw', async () => {
  const { runTool } = fakeRunTool();
  const out = await dispatchToolCall('drop_all_tables', {}, CTX, new Map(), runTool);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.code, 'unknown_tool');
});

test('write tool: runs with parsed input and the auth ctx; a model-supplied org id is inert', async () => {
  const { runTool, calls } = fakeRunTool();
  const { tool, seen } = writeTool();
  const out = await dispatchToolCall(
    'propose_mutation',
    { target: 'rail-item-3', organizationId: OTHER_ORG },
    CTX,
    new Map([[tool.name, tool]]),
    runTool,
  );
  assert.deepEqual(out, { ok: true, data: { ok: true, applied: 'rail-item-3' } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ctx.organizationId, ORG, 'ctx org wins over the argument');
  assert.equal(seen[0].ctx.staffId, 7);
  assert.equal(calls.length, 0, 'never reaches the read registry');
});

test('write tool: missing permission is forbidden and the tool never runs', async () => {
  const { runTool } = fakeRunTool();
  const { tool, seen } = writeTool({ permission: 'admin.manage_staff' });
  const out = await dispatchToolCall('propose_mutation', { target: 'x' }, CTX, new Map([[tool.name, tool]]), runTool);
  assert.deepEqual(out, { ok: false, code: 'forbidden', error: 'Missing permission admin.manage_staff' });
  assert.equal(seen.length, 0);
});

test('write tool: invalid input is invalid_input; undefined input parses as {}', async () => {
  const { runTool } = fakeRunTool();
  const { tool, seen } = writeTool();
  const map = new Map([[tool.name, tool]]);
  const bad = await dispatchToolCall('propose_mutation', { target: '' }, CTX, map, runTool);
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && bad.code, 'invalid_input');
  const missing = await dispatchToolCall('propose_mutation', undefined, CTX, map, runTool);
  assert.equal(missing.ok, false);
  assert.equal(missing.ok === false && missing.code, 'invalid_input');
  assert.equal(seen.length, 0);
});

test('write tool resolving { ok:false, error } is a tool_error carrying that error', async () => {
  const { runTool } = fakeRunTool();
  const { tool } = writeTool({
    run: async () => ({ ok: false as const, error: 'You do not have permission to make this change', httpStatus: 403 }),
  });
  const out = await dispatchToolCall('propose_mutation', { target: 'x' }, CTX, new Map([[tool.name, tool]]), runTool);
  assert.deepEqual(out, { ok: false, code: 'tool_error', error: 'You do not have permission to make this change' });
});

test('write tool that throws is a tool_error with the message — nothing escapes dispatch', async () => {
  const { runTool } = fakeRunTool();
  const { tool } = writeTool({
    run: async () => {
      throw new Error('connection reset');
    },
  });
  const out = await dispatchToolCall('propose_mutation', { target: 'x' }, CTX, new Map([[tool.name, tool]]), runTool);
  assert.deepEqual(out, { ok: false, code: 'tool_error', error: 'connection reset' });
});

test('buildWriteToolMap keeps only the tools whose permission the ctx holds', () => {
  const { tool: allowed } = writeTool();
  const { tool: denied } = writeTool({ name: 'revert_mutation', permission: 'admin.manage_staff' });
  const map = buildWriteToolMap(CTX, [allowed, denied]);
  assert.deepEqual([...map.keys()], ['propose_mutation']);
  assert.equal(buildWriteToolMap(CTX, undefined).size, 0);
});
