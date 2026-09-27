/**
 * The composer's Ask-only mode is a SERVER gate: an `ask` turn advertises and
 * dispatches GREEN reads only, and every write — including a write the model
 * names anyway — is refused at the dispatch chokepoint without running.
 * Also pins link_manual_to_sku's confirmation (propose → confirm on a later turn).
 * Run: pnpm test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listAssistantTools, GREEN_READ_TOOL_NAMES } from './index';
import { buildWriteToolMap, dispatchToolCall, type WriteToolDef } from './dispatch';
import { buildWriteTools } from './write-tools';
import { buildManualLinkTool, type ManualLinkDeps } from './manual-link-tools';
import type { AssistantToolCtx, AssistantToolRunResult } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
/** Holds every permission, so only the mode can narrow what it sees. */
const ALL: ReadonlySet<string> = { has: () => true } as unknown as ReadonlySet<string>;
const FULL: AssistantToolCtx = { organizationId: ORG, staffId: 1, permissions: ALL, accessMode: 'full' };
const ASK: AssistantToolCtx = { ...FULL, accessMode: 'ask' };

function spyTool(name: string) {
  const calls: unknown[] = [];
  const tool = {
    name,
    description: name,
    permission: 'assistant.chat',
    inputSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    run: async (input: unknown) => {
      calls.push(input);
      return { done: true };
    },
  } as unknown as WriteToolDef;
  return { tool, calls };
}

function spyRunner() {
  const calls: string[] = [];
  const run = (async (name: string) => {
    calls.push(name);
    return { ok: true, data: { read: name } } satisfies AssistantToolRunResult;
  }) as never;
  return { run, calls };
}

test('ask mode advertises only GREEN reads; full keeps the gateway tools', () => {
  const ask = listAssistantTools(ASK).map((t) => t.name);
  const full = listAssistantTools(FULL).map((t) => t.name);
  assert.ok(ask.length > 0);
  assert.ok(ask.every((n) => GREEN_READ_TOOL_NAMES.has(n)));
  for (const gateway of ['submit_approval_decision', 'execute_build_sandbox', 'commit_to_git']) {
    assert.ok(full.includes(gateway), `${gateway} visible in full access`);
    assert.ok(!ask.includes(gateway), `${gateway} hidden in ask only`);
  }
});

test('ask mode builds no write tools; full keeps propose_mutation and the manual link', () => {
  const writes = buildWriteTools('sess-1', undefined, ALL, { startedAt: new Date() });
  assert.equal(buildWriteToolMap(ASK, writes).size, 0);
  const full = [...buildWriteToolMap(FULL, writes).keys()];
  assert.ok(full.includes('propose_mutation') && full.includes('link_manual_to_sku'));
});

test('ask mode REFUSES a write at dispatch even when it is in the map, and never runs it', async () => {
  const link = spyTool('link_manual_to_sku');
  const propose = spyTool('propose_mutation');
  const map = new Map([
    ['link_manual_to_sku', link.tool],
    ['propose_mutation', propose.tool],
  ]);
  const runner = spyRunner();
  for (const name of ['link_manual_to_sku', 'propose_mutation']) {
    const out = await dispatchToolCall(name, { manualId: 1, sku: 'X' }, ASK, map, runner.run);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.code, 'forbidden');
    assert.match(out.ok === false ? out.error : '', /Ask only/);
  }
  assert.equal(link.calls.length + propose.calls.length, 0);
  assert.deepEqual(runner.calls, []);
});

test('ask mode refuses a named write even with an EMPTY map, and a gateway tool before the registry runs it', async () => {
  const runner = spyRunner();
  for (const name of ['revert_mutation', 'link_manual_to_sku', 'commit_to_git']) {
    const out = await dispatchToolCall(name, {}, ASK, new Map(), runner.run);
    assert.equal(out.ok === false && out.code, 'forbidden', name);
  }
  assert.deepEqual(runner.calls, []);
});

test('ask mode still dispatches GREEN reads; full mode dispatches writes as before', async () => {
  const runner = spyRunner();
  const read = await dispatchToolCall('locate_product', { query: 'X' }, ASK, new Map(), runner.run);
  assert.equal(read.ok, true);
  assert.deepEqual(runner.calls, ['locate_product']);

  const link = spyTool('link_manual_to_sku');
  const out = await dispatchToolCall('link_manual_to_sku', { manualId: 1 }, FULL, new Map([['link_manual_to_sku', link.tool]]), runner.run);
  assert.equal(out.ok, true);
  assert.equal(link.calls.length, 1);
});

// ─── link_manual_to_sku confirmation ─────────────────────────────────────────

function manualLinkFakes(pendingCreatedAt: Date) {
  const cap = { applied: [] as unknown[], reviewed: [] as unknown[] };
  const deps: ManualLinkDeps = {
    query: async (_org, sql) => {
      if (sql.includes('FROM product_manuals')) return { rows: [{ id: 7, display_name: 'Wave manual', sku_catalog_id: null }] };
      if (sql.includes('FROM sku_catalog')) return { rows: [{ id: 291, sku: '00066-P-2', zoho_item_title: 'Bose Wave' }] };
      if (sql.includes('FROM agent_mutations')) {
        return { rows: [{ id: 55, payload: { manualId: 7, sku: '00066-P-2' }, created_at: pendingCreatedAt.toISOString() }] };
      }
      return { rows: [] };
    },
    apply: (async (input: unknown) => {
      cap.applied.push(input);
      return { ok: true, status: 'proposed', mutationId: 55, trust: 'review', targetRef: null };
    }) as never,
    review: (async (input: unknown) => {
      cap.reviewed.push(input);
      return { ok: true, status: 'applied', mutationId: 55, targetRef: '7' };
    }) as never,
    settle: async () => {},
  };
  return { deps, cap };
}

test('link_manual_to_sku proposes (review queue) and does not apply', async () => {
  const { deps, cap } = manualLinkFakes(new Date());
  const tool = buildManualLinkTool('sess-1', new Date(), deps);
  const out = (await tool.run({ action: 'propose', manualId: 7, sku: '00066-p-2' }, FULL, {} as never)) as {
    status: string;
    sku: string;
  };
  assert.equal(out.status, 'needs_confirmation');
  assert.equal(out.sku, '00066-P-2');
  assert.deepEqual(cap.applied, [
    {
      organizationId: ORG,
      mutationKind: 'product_manual.link_sku',
      payload: { manualId: 7, sku: '00066-P-2' },
      proposedByStaffId: 1,
      aiChatSessionId: 'sess-1',
    },
  ]);
  assert.equal(cap.reviewed.length, 0);
});

test('link_manual_to_sku cannot be confirmed in the turn that proposed it', async () => {
  const turnStart = new Date('2026-09-27T12:00:00Z');
  const { deps, cap } = manualLinkFakes(new Date('2026-09-27T12:00:03Z'));
  const tool = buildManualLinkTool('sess-1', turnStart, deps);
  const out = (await tool.run({ action: 'confirm' }, FULL, {} as never)) as { ok: boolean; error: string };
  assert.equal(out.ok, false);
  assert.match(out.error, /not confirmed yet/);
  assert.equal(cap.reviewed.length, 0);
});

test('link_manual_to_sku confirm on a later turn approves the pending proposal and returns a record', async () => {
  const { deps, cap } = manualLinkFakes(new Date('2026-09-27T11:59:00Z'));
  const tool = buildManualLinkTool('sess-1', new Date('2026-09-27T12:00:00Z'), deps);
  const out = (await tool.run({ action: 'confirm' }, FULL, {} as never)) as {
    artifact: { kind: string; fields: Array<{ label: string; value: string }> };
  };
  assert.equal(cap.reviewed.length, 1);
  assert.deepEqual(
    { ...(cap.reviewed[0] as Record<string, unknown>), actorPermissions: undefined },
    { organizationId: ORG, mutationId: 55, decision: 'approve', actorStaffId: 1, actorPermissions: undefined, kinds: ['product_manual.link_sku'] },
  );
  assert.equal(out.artifact.kind, 'record');
  assert.ok(out.artifact.fields.some((f) => f.label === 'SKU' && f.value === '00066-P-2'));
});

test('link_manual_to_sku refuses in ask mode even when called directly', async () => {
  const { deps, cap } = manualLinkFakes(new Date(0));
  const tool = buildManualLinkTool('sess-1', new Date(), deps);
  const out = (await tool.run({ action: 'propose', manualId: 7, sku: '00066-P-2' }, ASK, {} as never)) as { ok: boolean };
  assert.equal(out.ok, false);
  assert.equal(cap.applied.length, 0);
});
