/**
 * DB-free, network-free tests for the SuperGrok tool loop (Ask plan §17.6).
 * A scripted `streamTurn` drives the loop; a fake fetch drives the wire
 * adapter (accumulation, finish_reason quirks, 401 refresh, buffered fallback).
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWriteTools } from './tools/write-tools';
import {
  makeGrokLoopDeps,
  markGrokBufferedFallback,
  resetGrokWireMemo,
  runGrokAssistantTurn,
  type GrokLoopDeps,
  type GrokTurnParams,
  type GrokTurnResult,
  type GrokWireMessage,
} from './grok-agent-loop';
import type { AssistantEmit } from './agent-loop';
import type { AssistantToolCtx } from './tools/types';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AiProviderConfig } from '@/lib/ai/provider';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const OTHER_ORG = '99999999-9999-9999-9999-999999999999';
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set(['dashboard.view', 'studio.view', 'assistant.chat']),
};

// ─── Loop-level fakes ────────────────────────────────────────────────────────

function fakes(script: GrokTurnResult[], toolOk: (name: string) => boolean = () => true) {
  const cap = {
    rounds: [] as GrokTurnParams[],
    toolCalls: [] as Array<{ name: string; input: unknown; orgId: string }>,
    emitted: [] as AssistantEmit[],
    batches: 0,
  };
  let i = 0;
  const deps: GrokLoopDeps = {
    streamTurn: async (params, onTextDelta) => {
      // Deep-copy: the loop mutates `messages` between rounds, and a test that
      // asserts on round 1 must not see round 2's appends.
      cap.rounds.push(JSON.parse(JSON.stringify(params)) as GrokTurnParams);
      const round = script[Math.min(i, script.length - 1)];
      i += 1;
      if (round.text) onTextDelta(round.text);
      return round;
    },
    runTool: async (name, input, ctx) => {
      cap.toolCalls.push({ name, input, orgId: ctx.organizationId });
      return toolOk(name)
        ? { ok: true, data: { rows: [1, 2, 3] } }
        : { ok: false, code: 'tool_error', error: `${name} failed: boom` };
    },
  };
  const emit = (e: AssistantEmit) => cap.emitted.push(e);
  const runToolBatch = async <T,>(fn: () => Promise<T>) => {
    cap.batches += 1;
    return fn();
  };
  return { deps, cap, emit, runToolBatch };
}

const round = (over: Partial<GrokTurnResult> = {}): GrokTurnResult => ({
  text: '',
  toolCalls: [],
  finishReason: 'stop',
  ...over,
});

// ─── Loop behaviour ──────────────────────────────────────────────────────────

test('tool round: dispatch gets the AUTH org, the result is echoed with the matching tool_call_id', async () => {
  const { deps, cap, emit, runToolBatch } = fakes([
    round({
      text: 'Let me check.',
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'call_abc', name: 'get_order_lookup', arguments: '{"trackingNumber":"1Z999"}' }],
    }),
    round({ text: 'Order 55012, delivered Tuesday.', finishReason: 'stop' }),
  ]);

  const out = await runGrokAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'look up tracking 1Z999', emit, runToolBatch },
    deps,
  );

  assert.equal(out.ok, true);
  assert.equal(out.turns, 2);
  assert.equal(out.text, 'Let me check.\n\nOrder 55012, delivered Tuesday.');
  assert.deepEqual(out.toolsUsed, ['get_order_lookup']);
  assert.deepEqual(cap.toolCalls, [
    { name: 'get_order_lookup', input: { trackingNumber: '1Z999' }, orgId: ORG },
  ]);

  // Round 2 carries the assistant tool_calls turn then one role:'tool' message.
  const second = cap.rounds[1].messages;
  const assistantTurn = second.at(-2) as Extract<GrokWireMessage, { role: 'assistant' }>;
  assert.equal(assistantTurn.role, 'assistant');
  assert.equal(assistantTurn.tool_calls?.[0].id, 'call_abc');
  assert.equal(assistantTurn.tool_calls?.[0].function.name, 'get_order_lookup');
  const toolTurn = second.at(-1) as Extract<GrokWireMessage, { role: 'tool' }>;
  assert.equal(toolTurn.role, 'tool');
  assert.equal(toolTurn.tool_call_id, 'call_abc');
  assert.match(toolTurn.content, /rows/);

  assert.equal(cap.batches, 1, 'one tenant connection for the round');
  assert.deepEqual(
    cap.emitted.filter((e) => e.type === 'tool_start').map((e) => (e as { name: string }).name),
    ['get_order_lookup'],
  );
});

test('a model-supplied organizationId in the arguments never becomes the org', async () => {
  const { deps, cap, emit } = fakes([
    round({
      finishReason: 'tool_calls',
      toolCalls: [
        { id: 'c1', name: 'get_kpis', arguments: `{"organizationId":"${OTHER_ORG}","rangeDays":7}` },
      ],
    }),
    round({ text: 'done', finishReason: 'stop' }),
  ]);
  await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis', emit }, deps);
  assert.equal(cap.toolCalls[0].orgId, ORG);
  assert.deepEqual(cap.toolCalls[0].input, { organizationId: OTHER_ORG, rangeDays: 7 });
});

test('a failing tool is handed back as ERROR text; the loop keeps going', async () => {
  const { deps, cap, emit } = fakes(
    [
      round({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'get_kpis', arguments: '{}' }] }),
      round({ text: 'The KPI source is unavailable right now.', finishReason: 'stop' }),
    ],
    () => false,
  );
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis?', emit }, deps);
  assert.equal(out.ok, true);
  const toolTurn = cap.rounds[1].messages.at(-1) as Extract<GrokWireMessage, { role: 'tool' }>;
  assert.match(toolTurn.content, /^ERROR: /);
  assert.match(toolTurn.content, /failed/);
  assert.equal(
    (cap.emitted.find((e) => e.type === 'tool_end') as { ok: boolean }).ok,
    false,
  );
});

test('UI tool: forwarded to the browser, acknowledged to the model, never hits the registry', async () => {
  const { deps, cap, emit } = fakes([
    round({
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'c_nav', name: 'navigate', arguments: '{"path":"/operations"}' }],
    }),
    round({ text: 'Taking you there.', finishReason: 'stop' }),
  ]);
  await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'show me analytics', emit }, deps);
  assert.equal(cap.toolCalls.length, 0);
  const ui = cap.emitted.find((e) => e.type === 'ui_tool') as { name: string; input: { path: string } };
  assert.equal(ui.name, 'navigate');
  assert.equal(ui.input.path, '/operations');
  const toolTurn = cap.rounds[1].messages.at(-1) as Extract<GrokWireMessage, { role: 'tool' }>;
  assert.match(toolTurn.content, /Dispatched/);
});

test('system prompt: core, then the voice overlay, then page context; history is sent', async () => {
  const { deps, cap, emit } = fakes([round({ text: 'hi', finishReason: 'stop' })]);
  await runGrokAssistantTurn(
    {
      ctx: CTX,
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ],
      userMessage: 'hello',
      context: { page: 'unbox', mode: 'ask', skill: 'Unbox vocab' },
      voiceOverlay: 'You are the Unbox helper standing at this carton.',
      emit,
    },
    deps,
  );
  const messages = cap.rounds[0].messages;
  const system = messages[0] as Extract<GrokWireMessage, { role: 'system' }>;
  assert.equal(system.role, 'system');
  const coreAt = system.content.indexOf('operations assistant');
  const voiceAt = system.content.indexOf('Unbox helper');
  const contextAt = system.content.indexOf('Unbox vocab');
  assert.ok(coreAt >= 0 && voiceAt > coreAt && contextAt > voiceAt, 'core → voice → context');
  assert.match(system.content, /hybrid_entity_search/);

  // History reaches Grok — it used to be loaded and handed only to Anthropic.
  assert.deepEqual(
    messages.slice(1).map((m) => [m.role, 'content' in m ? m.content : null]),
    [
      ['user', 'earlier question'],
      ['assistant', 'earlier answer'],
      ['user', 'hello'],
    ],
  );
});

test('permission-filtered registry is advertised in the OpenAI envelope', async () => {
  const { deps, cap, emit } = fakes([round({ text: 'hi', finishReason: 'stop' })]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'hi', emit }, deps);
  const names = cap.rounds[0].tools.map((t) => t.function.name);
  assert.ok(names.includes('hybrid_entity_search'));
  assert.ok(names.includes('get_order_lookup'));
  assert.ok(names.includes('navigate'));
  assert.ok(!names.includes('get_operations_journey'), 'operations.view is gated out of this ctx');
  for (const t of cap.rounds[0].tools) {
    assert.equal(t.type, 'function');
    assert.equal(t.function.parameters.type, 'object');
  }
  assert.equal(out.toolsAdvertised, names.length);
  assert.ok(out.wireBytes > 0);
});

test('a non-empty call map is a tool round even when finish_reason says "stop"', async () => {
  // Observed on OpenAI-compatible relays (open-webui#21768).
  const { deps, cap, emit } = fakes([
    round({
      finishReason: 'stop',
      toolCalls: [{ id: 'c1', name: 'get_kpis', arguments: '{}' }],
    }),
    round({ text: 'Shipped 200.', finishReason: 'stop' }),
  ]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis', emit }, deps);
  assert.equal(out.turns, 2, 'the call was executed, not treated as the end of the turn');
  assert.equal(cap.toolCalls.length, 1);
});

test('a call narrated as <tool_call> text is salvaged and never shown to the operator', async () => {
  const { deps, cap, emit } = fakes([
    round({
      text: 'Sure! <tool_call>{"name":"get_kpis","arguments":{"rangeDays":7}}</tool_call>',
      finishReason: 'stop',
    }),
    round({ text: 'Shipped 200, returned 18.', finishReason: 'stop' }),
  ]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis', emit }, deps);
  assert.deepEqual(cap.toolCalls, [{ name: 'get_kpis', input: { rangeDays: 7 }, orgId: ORG }]);
  assert.equal(out.text, 'Shipped 200, returned 18.', 'the JSON blob is not part of the answer');
});

test('narration that only looks like a call is left alone as prose', async () => {
  const { deps, cap, emit } = fakes([
    round({ text: 'I could call {"name":"not_a_real_tool"} but I will not.', finishReason: 'stop' }),
  ]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'hm', emit }, deps);
  assert.equal(cap.toolCalls.length, 0);
  assert.match(out.text, /I will not/);
});

test('unparseable tool arguments still dispatch (as {}) so the registry can reject them', async () => {
  const { deps, cap, emit } = fakes([
    round({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'get_kpis', arguments: 'not json' }] }),
    round({ text: 'ok', finishReason: 'stop' }),
  ]);
  await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis', emit }, deps);
  assert.deepEqual(cap.toolCalls[0].input, {});
});

test('hard iteration cap: a model that never stops calling is cut off politely', async () => {
  const { deps, cap, emit } = fakes([
    round({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'get_kpis', arguments: '{}' }] }),
  ]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'loop forever', emit }, deps);
  assert.equal(out.ok, true);
  assert.equal(out.turns, 8);
  assert.match(out.text, /ran out of steps/);
  assert.equal(cap.toolCalls.length, 8);
});

test('a thrown round emits error + ok:false (the route maps it to SSE error, not a 500)', async () => {
  const deps: GrokLoopDeps = {
    streamTurn: async () => {
      throw new Error('Grok proxy returned 500');
    },
    runTool: async () => ({ ok: true, data: {} }),
  };
  const emitted: AssistantEmit[] = [];
  const out = await runGrokAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'hi', emit: (e) => emitted.push(e) },
    deps,
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, 'Grok proxy returned 500');
  assert.deepEqual(emitted, [{ type: 'error', message: 'Grok proxy returned 500' }]);
});

test('streamed narration equals the persisted text, separators included', async () => {
  const { deps, cap, emit } = fakes([
    round({
      text: 'Checking the KPIs…',
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'c1', name: 'get_kpis', arguments: '{}' }],
    }),
    round({ text: 'Shipped 200, returned 18.', finishReason: 'stop' }),
  ]);
  const out = await runGrokAssistantTurn({ ctx: CTX, history: [], userMessage: 'kpis', emit }, deps);
  const streamed = cap.emitted
    .filter((e) => e.type === 'delta')
    .map((e) => (e as { text: string }).text)
    .join('');
  assert.equal(streamed, out.text);
});

// ─── Wire adapter (fake fetch) ───────────────────────────────────────────────

const CONFIG: AiProviderConfig = {
  baseURL: 'https://cli-chat-proxy.example/v1',
  apiKey: 'test-token',
  model: 'grok-4.6',
  headers: { 'X-XAI-Token-Auth': 'xai-grok-cli' },
};

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const c of chunks) controller.enqueue(encoder.encode(`data: ${c}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PARAMS: GrokTurnParams = {
  messages: [{ role: 'user', content: 'hi' }],
  tools: [],
  stream: true,
};

test('wire: a tool call split across chunks starting at index 1 accumulates into one call', async () => {
  resetGrokWireMemo();
  const deps = await makeGrokLoopDeps(ORG, 'sess', {
    config: CONFIG,
    fetchImpl: async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_x', function: { name: 'get_order_lookup', arguments: '{"track' } }] } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: 'ingNumber":"1Z' } }] } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '999"}' } }] } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      ]),
  });
  const out = await deps.streamTurn(PARAMS, () => {});
  assert.deepEqual(out.toolCalls, [
    { id: 'call_x', name: 'get_order_lookup', arguments: '{"trackingNumber":"1Z999"}' },
  ]);
  assert.equal(out.finishReason, 'tool_calls');
});

test('wire: text deltas stream through; reasoning_content is dropped', async () => {
  resetGrokWireMemo();
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    fetchImpl: async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking hard…' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Order ' } }] }),
        JSON.stringify({ choices: [{ delta: { content: '55012.' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      ]),
  });
  const seen: string[] = [];
  const out = await deps.streamTurn(PARAMS, (t) => seen.push(t));
  assert.deepEqual(seen, ['Order ', '55012.']);
  assert.equal(out.text, 'Order 55012.');
  assert.ok(!out.text.includes('thinking'));
});

test('wire: two parallel calls keep their own arguments and come back in index order', async () => {
  resetGrokWireMemo();
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    fetchImpl: async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { tool_calls: [
          { index: 0, id: 'a', function: { name: 'get_kpis', arguments: '{"a":1}' } },
          { index: 1, id: 'b', function: { name: 'get_top_reasons', arguments: '{"b":2}' } },
        ] } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      ]),
  });
  const out = await deps.streamTurn(PARAMS, () => {});
  assert.deepEqual(out.toolCalls.map((c) => [c.id, c.name, c.arguments]), [
    ['a', 'get_kpis', '{"a":1}'],
    ['b', 'get_top_reasons', '{"b":2}'],
  ]);
});

test('wire: a 400 on the streamed round retries buffered, and the next turn goes straight there', async () => {
  resetGrokWireMemo();
  const attempts: boolean[] = [];
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { stream: boolean };
      attempts.push(body.stream);
      if (body.stream) return jsonResponse({ error: { message: 'tools not supported with stream' } }, 400);
      return jsonResponse({
        choices: [
          {
            message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'get_kpis', arguments: '{}' } }] },
            finish_reason: 'tool_calls',
          },
        ],
      });
    },
  });

  const first = await deps.streamTurn(PARAMS, () => {});
  assert.deepEqual(first.toolCalls, [{ id: 'c1', name: 'get_kpis', arguments: '{}' }]);
  assert.deepEqual(attempts, [true, false], 'streamed once, then buffered');

  await deps.streamTurn(PARAMS, () => {});
  assert.deepEqual(attempts, [true, false, false], 'the memo skips the failing streamed attempt');
  resetGrokWireMemo();
});

test('wire: the buffered memo is per org and expires', async () => {
  resetGrokWireMemo();
  const now = Date.now();
  markGrokBufferedFallback(ORG, now);
  const { grokPrefersBufferedRound } = await import('./grok-agent-loop');
  assert.equal(grokPrefersBufferedRound(ORG, now + 1000), true);
  assert.equal(grokPrefersBufferedRound(OTHER_ORG, now + 1000), false, 'another org is unaffected');
  assert.equal(grokPrefersBufferedRound(ORG, now + 61 * 60 * 1000), false, 'expired after an hour');
  resetGrokWireMemo();
});

test('wire: a 401 mid-loop re-resolves the session once and retries the round', async () => {
  resetGrokWireMemo();
  let resolves = 0;
  let calls = 0;
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    resolveConfig: async () => {
      resolves += 1;
      return { ...CONFIG, apiKey: 'refreshed-token' };
    },
    fetchImpl: async (_url, init) => {
      calls += 1;
      const auth = (init as RequestInit).headers as Record<string, string>;
      if (auth.Authorization === 'Bearer test-token') return jsonResponse({ error: 'expired' }, 401);
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { content: 'back online' }, finish_reason: 'stop' }] }),
      ]);
    },
  });
  const out = await deps.streamTurn(PARAMS, () => {});
  assert.equal(out.text, 'back online');
  assert.equal(resolves, 1, 'refreshed exactly once');
  assert.equal(calls, 2, 'one failed round, one retry');
});

test('wire: a second 401 stops with a reconnect sentence rather than looping', async () => {
  resetGrokWireMemo();
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    resolveConfig: async () => CONFIG,
    fetchImpl: async () => jsonResponse({ error: 'expired' }, 401),
  });
  await assert.rejects(deps.streamTurn(PARAMS, () => {}), /reconnect in Settings/);
});

test('wire: a 5xx is not retried buffered — it is a proxy outage, not a tools problem', async () => {
  resetGrokWireMemo();
  let calls = 0;
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: CONFIG,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ error: 'upstream' }, 503);
    },
  });
  await assert.rejects(deps.streamTurn(PARAMS, () => {}), /503/);
  assert.equal(calls, 1);
  assert.equal((await import('./grok-agent-loop')).grokPrefersBufferedRound(ORG), false);
});

// ─── Self-hosted advertisement subsetting (train handoff §3) ────────────────
test('selfHosted deps: the wire advertises the subset, not every verb', async () => {
  const { deps, cap, emit } = fakes([
    round({ text: 'Top reason: battery health.', finishReason: 'stop' }),
  ]);
  const out = await runGrokAssistantTurn(
    {
      ctx: CTX,
      history: [],
      userMessage: 'what are the top return reasons this week',
      writeTools: buildWriteTools(null),
      emit,
    },
    { ...deps, selfHosted: true },
  );
  assert.equal(out.ok, true);
  const sent = cap.rounds[0].tools?.map((t: { function: { name: string } }) => t.function.name) ?? [];
  // The registry core always rides…
  for (const name of ['hybrid_entity_search', 'exact_id_serial_search', 'render_artifact', 'propose_mutation']) {
    assert.ok(sent.includes(name), `${name} must stay advertised`);
  }
  // …the relevant verb is picked…
  assert.ok(sent.includes('get_top_reasons'), 'top-reasons verb should rank in');
  // …and unrelated verbs stay OFF the wire (the whole point).
  assert.ok(!sent.includes('get_station_catalog'));
  assert.ok(!sent.includes('search_photos'));
  assert.ok(out.wireBytes < 12_000, `wire bytes must drop below the 12 kB budget, got ${out.wireBytes}`);
  assert.ok(out.toolsAdvertised <= 10, `cap respected, got ${out.toolsAdvertised}`);
  assert.deepEqual(out.advertisedToolNames, sent, 'the result reports exactly what went on the wire');
  // The system prompt lists exactly the advertised subset, so the model and
  // the wire never disagree about what exists.
  const system = cap.rounds[0].messages[0] as { role: string; content: string };
  assert.match(system.content, /Available tools: .*get_top_reasons/);
  assert.doesNotMatch(system.content, /get_station_catalog/);
});

test('non-selfHosted deps: the full advertisement is untouched (managed runtimes keep every verb)', async () => {
  const { deps, cap, emit } = fakes([
    round({ text: 'Answered.', finishReason: 'stop' }),
  ]);
  await runGrokAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'is serial 4400123456 under warranty', emit },
    deps,
  );
  const sent = cap.rounds[0].tools?.map((t: { function: { name: string } }) => t.function.name) ?? [];
  assert.ok(sent.includes('get_station_catalog'), 'managed runtimes see the whole registry');
  assert.ok(sent.includes('search_notes'));
});

test('wire: makeGrokLoopDeps marks loopback endpoints self-hosted', async () => {
  const deps = await makeGrokLoopDeps(ORG, null, {
    config: { ...CONFIG, baseURL: 'http://127.0.0.1:8000/v1' },
    fetchImpl: async () =>
      sseResponse([JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })]),
  });
  assert.equal(deps.selfHosted, true);
});
