/** END-TO-END PROOF: */

// Side-effect FIRST: the registry import below transitively loads the Neon
// client, which validates DATABASE_URL's format at module load. No connection
// is ever opened — every query in this file goes through an injected fake.
import '@/lib/assistant/test-db-url';

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpMessage, type McpServerDeps } from '@/lib/mcp/tool-server';
import { listAssistantTools, runAssistantTool } from '@/lib/assistant/tools';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';
import { searchToolRegistry } from './dedupe';

const ORG = '11111111-2222-3333-4444-555555555555';
const OTHER_ORG = '99999999-8888-7777-6666-555555555555';

/** A staffer who may search the registry and request a tool. */
const STAFF_CTX: AssistantToolCtx = {
  organizationId: ORG as AssistantToolCtx['organizationId'],
  staffId: 7,
  permissions: new Set(['assistant.chat', 'tool_forge.search', 'tool_forge.request']),
};

/** The org's existing capabilities, as tool_registry rows. */
const REGISTRY = [
  { id: 42, tool_key: 'lookup_serial', name: 'Serial lookup',
    source_path: 'src/lib/assistant/tools/domain-read-tools.ts', similarity: 0.94 },
  { id: 43, tool_key: 'get_packing_kpi', name: 'Packing KPI',
    source_path: 'src/lib/assistant/tools/domain-read-tools.ts', similarity: 0.55 },
  { id: 44, tool_key: 'search_photos', name: 'Photo search',
    source_path: 'src/lib/assistant/tools/domain-read-tools.ts', similarity: 0.31 },
];

/**
 * Stand-in for the tenant pool. Records every (orgId, sql) pair so the test can
 * assert that no query was ever issued for an org the caller merely *claimed*.
 */
function fakeDb(rows = REGISTRY) {
  const calls: Array<{ orgId: string; sql: string }> = [];
  const query = async (orgId: string, sql: string) => {
    calls.push({ orgId, sql });
    if (sql.includes('count(embedding)')) {
      return { rows: [{ active_count: rows.length, embedded_count: rows.length }] };
    }
    return { rows: rows as unknown as Array<Record<string, unknown>> };
  };
  return { calls, query };
}

const fakeEmbed = async (texts: string[]) => texts.map(() => new Array(768).fill(0.01));

/** Wire the real chokepoint with the DB + provider stubbed at the lowest seam. */
function mcpDeps(db: ReturnType<typeof fakeDb>): McpServerDeps {
  const toolDeps: AssistantToolDeps = {
    query: db.query as AssistantToolDeps['query'],
    toolForgeDedupe: (orgId, prompt) =>
      searchToolRegistry(orgId, prompt, { embed: fakeEmbed, query: db.query as never }),
  };
  return {
    listTools: (ctx) => listAssistantTools(ctx),
    runTool: (name, args, ctx) => runAssistantTool(name, args, ctx, toolDeps),
  };
}

function callTool(name: string, args: unknown, ctx = STAFF_CTX, db = fakeDb()) {
  return handleMcpMessage(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    ctx,
    mcpDeps(db),
  );
}

/** tools/call results come back as a JSON string in content[0].text. */
function payload(res: Awaited<ReturnType<typeof handleMcpMessage>>) {
  const result = (res as { result: { content: Array<{ text: string }>; isError: boolean } }).result;
  return { isError: result.isError, data: JSON.parse(result.content[0].text) };
}

test('THE PROOF — requesting a tool that already exists is DENIED with the duplicate id', async () => {
  const res = await callTool('search_tool_registry', {
    prompt: 'I need a tool that looks up a serial number and shows me that unit history',
  });

  const { data } = payload(res);

  assert.equal(data.verdict, 'denied', 'a 94% match must be denied');
  assert.equal(data.reason_code, 'duplicate_tool');
  assert.equal(data.duplicate_tool_id, 42, 'the caller must receive the duplicate tool id');
  assert.equal(data.closest_match.tool_key, 'lookup_serial');
  assert.equal(data.closest_match.similarity, 0.94);
  assert.equal(data.threshold, 0.9);
  assert.match(data.exact_reason, /94\.0% semantic match/);
  assert.match(data.exact_reason, /Serial lookup/);
  assert.match(
    data.exact_reason,
    /src\/lib\/assistant\/tools\/domain-read-tools\.ts/,
    'the denial carries the path the requester should be sent to',
  );
});

test('a genuinely novel request is approved', async () => {
  const db = fakeDb([{ ...REGISTRY[1], similarity: 0.41 }]);
  const res = await callTool(
    'search_tool_registry',
    { prompt: 'Alert me when a pallet has been sitting in the staging lane for over 48 hours' },
    STAFF_CTX,
    db,
  );
  const { data } = payload(res);
  assert.equal(data.verdict, 'approved');
  assert.equal(data.reason_code, 'approved_novel');
  assert.equal(data.duplicate_tool_id, null);
});

test('a model-supplied tenant_id is ignored — the org comes from the session', async () => {
  const db = fakeDb();
  const res = await callTool(
    'search_tool_registry',
    { prompt: 'look up a serial number and show unit history', tenant_id: OTHER_ORG },
    STAFF_CTX,
    db,
  );
  const { data } = payload(res);

  assert.equal(data.tenant_id_ignored, true, 'the response must say the argument did nothing');
  assert.ok(db.calls.length > 0, 'the search actually hit the database');
  for (const call of db.calls) {
    assert.equal(call.orgId, ORG, 'every query ran against the SESSION org');
    assert.notEqual(call.orgId, OTHER_ORG, 'the model-supplied tenant id never reached SQL');
  }
  // Still denied — reading someone else's registry was never on the table.
  assert.equal(data.verdict, 'denied');
});

test('FAILS CLOSED: when the embedding provider is down the request is denied, not approved', async () => {
  const db = fakeDb();
  const toolDeps: AssistantToolDeps = {
    query: db.query as AssistantToolDeps['query'],
    toolForgeDedupe: (orgId, prompt) =>
      searchToolRegistry(orgId, prompt, {
        embed: async () => { throw new Error('ECONNREFUSED'); },
        query: db.query as never,
      }),
  };
  const res = await handleMcpMessage(
    { jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'search_tool_registry', arguments: { prompt: 'anything at all' } } },
    STAFF_CTX,
    { listTools: (c) => listAssistantTools(c), runTool: (n, a, c) => runAssistantTool(n, a, c, toolDeps) },
  );

  const { data } = payload(res);
  assert.equal(data.verdict, 'denied');
  assert.equal(data.reason_code, 'could_not_measure');
  assert.equal(data.measured, false);
  assert.match(data.exact_reason, /ECONNREFUSED/);
});

test('FAILS CLOSED: a registry that exists but is not embedded yet is unmeasurable', async () => {
  const db = {
    calls: [] as Array<{ orgId: string; sql: string }>,
    query: async (orgId: string, sql: string) => {
      db.calls.push({ orgId, sql });
      // Three active tools, none embedded — the nearest-neighbour query would
      // return zero rows, which must NOT read as "nothing duplicates this".
      if (sql.includes('count(embedding)')) return { rows: [{ active_count: 3, embedded_count: 0 }] };
      return { rows: [] };
    },
  };
  const res = await callTool('search_tool_registry', { prompt: 'x' }, STAFF_CTX, db as never);
  const { data } = payload(res);
  assert.equal(data.verdict, 'denied');
  assert.equal(data.reason_code, 'could_not_measure');
  assert.match(data.exact_reason, /none are embedded/);
});

test('the gateway refuses a caller who lacks the tool-forge permission', async () => {
  const chatOnly: AssistantToolCtx = {
    organizationId: ORG as AssistantToolCtx['organizationId'],
    staffId: 8,
    permissions: new Set(['assistant.chat']),   // the /api/mcp route gate, and nothing more
  };
  const res = await callTool('search_tool_registry', { prompt: 'x' }, chatOnly);
  const result = (res as { result: { content: Array<{ text: string }>; isError: boolean } }).result;

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Missing permission tool_forge\.search/);
});

test('tools/list hides the gateway tools from a chat-only caller and shows them to a holder', async () => {
  const chatOnly = { permissions: new Set(['assistant.chat']) };
  const holder = {
    permissions: new Set([
      'assistant.chat', 'tool_forge.search', 'tool_forge.decide',
      'tool_forge.build', 'tool_forge.commit',
    ]),
  };
  const forge = ['search_tool_registry', 'submit_approval_decision', 'execute_build_sandbox', 'commit_to_git'];

  const hidden = listAssistantTools(chatOnly as never).map((t) => t.name);
  for (const name of forge) {
    assert.ok(!hidden.includes(name), `${name} must not be visible on assistant.chat alone`);
  }

  const visible = listAssistantTools(holder as never).map((t) => t.name);
  for (const name of forge) {
    assert.ok(visible.includes(name), `${name} must be listed for a permission holder`);
  }
  assert.equal(forge.length, 4, 'the gateway exposes exactly four tools');
});

test('a model cannot assert the gate\'s own reason codes through submit_approval_decision', async () => {
  const res = await callTool(
    'submit_approval_decision',
    { request_id: 1, decision: 'approved', reason: 'looks fine to me', reason_code: 'duplicate_tool' },
    { ...STAFF_CTX, permissions: new Set(['tool_forge.decide']) },
  );
  const result = (res as { result: { content: Array<{ text: string }>; isError: boolean } }).result;

  assert.equal(result.isError, true, 'duplicate_tool is not a code a caller may submit');
  assert.match(result.content[0].text, /Invalid input for submit_approval_decision/);
});
