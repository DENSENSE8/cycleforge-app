/**
 * DB-free, network-free tests for the unified pi-ai tool loop.
 *
 * The model is pi-ai's OWN `fauxProvider` driving a real `createModels()`
 * collection, so the loop runs against the same `AssistantMessageEventStream`
 * protocol a live provider produces — start / text_* / toolcall_* / done — and
 * not against a hand-written stand-in for it. No credentials, no vault, no
 * fetch. `runTool` is faked; `dispatchToolCall`, the registry chokepoint and
 * the artifact contract are all real.
 *
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *        --test src/lib/assistant/pi-agent-loop.test.ts
 */

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type * as PiAi from '@earendil-works/pi-ai';
import { MAX_PI_TURNS, piToolsFromRegistry, runPiAssistantTurn } from './pi-agent-loop';
import { UI_TOOLS, type AssistantEmit } from './agent-loop';
import { listAssistantTools } from './tools';
import type { AssistantToolCtx, AssistantToolRunResult } from './tools/types';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * `@earendil-works/pi-ai` publishes only the `import` export condition
 * (package.json `exports`), and tsx transpiles this `.ts` file to CJS — a
 * static value import resolves through the CJS loader and dies with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Dynamic import goes through the ESM resolver,
 * so the ONE runtime dependency on the package is loaded here. The loop itself
 * imports pi-ai for types only, which erase.
 */
let pi: typeof PiAi;
before(async () => {
  pi = await import('@earendil-works/pi-ai');
});

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const OTHER_ORG = '99999999-9999-9999-9999-999999999999';
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set(['dashboard.view', 'studio.view', 'assistant.chat']),
};

interface Harness {
  models: PiAi.Models;
  model: PiAi.Model<PiAi.Api>;
  emitted: AssistantEmit[];
  emit: (e: AssistantEmit) => void;
  toolCalls: Array<{ name: string; input: unknown; orgId: string }>;
  /** Every `Context` the loop handed the provider, deep-copied per round. */
  rounds: PiAi.Context[];
  batches: number;
  runTool: (name: string, input: unknown, ctx: AssistantToolCtx) => Promise<AssistantToolRunResult>;
  runToolBatch: <T>(fn: () => Promise<T>) => Promise<T>;
}

function harness(
  script: PiAi.AssistantMessage[],
  toolResult: (name: string) => AssistantToolRunResult = () => ({ ok: true, data: { rows: [1, 2, 3] } }),
): Harness {
  const faux = pi.fauxProvider({ tokensPerSecond: 1e6, models: [{ id: 'unified' }] });
  const models = pi.createModels();
  models.setProvider(faux.provider);
  const rounds: PiAi.Context[] = [];
  // Response FACTORIES, not bare messages: this is the only place the loop's
  // per-round Context is observable, and the loop mutates `messages` between
  // rounds — so snapshot it here.
  faux.setResponses(
    script.map((message) => (context: PiAi.Context) => {
      rounds.push(JSON.parse(JSON.stringify(context)) as PiAi.Context);
      return message;
    }),
  );

  const h: Harness = {
    models,
    model: faux.getModel(),
    emitted: [],
    emit: (e) => h.emitted.push(e),
    toolCalls: [],
    rounds,
    batches: 0,
    runTool: async (name, input, ctx) => {
      h.toolCalls.push({ name, input, orgId: ctx.organizationId });
      return toolResult(name);
    },
    runToolBatch: async (fn) => {
      h.batches += 1;
      return fn();
    },
  };
  return h;
}

const TABLE = {
  kind: 'table' as const,
  title: 'Open receivings',
  columns: ['id', 'carrier'],
  rows: [{ id: 'R-1', carrier: 'UPS' }],
};

/** Tool-result messages the model was shown, oldest first. */
function toolResultsIn(context: PiAi.Context): PiAi.ToolResultMessage[] {
  return context.messages.filter((m): m is PiAi.ToolResultMessage => m.role === 'toolResult');
}

function textOf(result: PiAi.ToolResultMessage): string {
  return result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
}

// ─── 1. Text-only turn ───────────────────────────────────────────────────────

test('text-only turn streams deltas and returns the joined text', async () => {
  const h = harness([pi.fauxAssistantMessage([pi.fauxText('Nothing is waiting at receiving.')])]);

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'anything at receiving?', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.equal(out.text, 'Nothing is waiting at receiving.');
  assert.equal(out.turns, 1);
  assert.deepEqual(out.toolsUsed, []);
  assert.ok(out.toolsAdvertised > 0);
  const deltas = h.emitted.filter((e) => e.type === 'delta');
  assert.ok(deltas.length > 1, 'text arrived as multiple streamed deltas');
  assert.equal(deltas.map((e) => (e.type === 'delta' ? e.text : '')).join(''), out.text);
});

test('history is replayed and leading assistant turns are trimmed', async () => {
  const h = harness([pi.fauxAssistantMessage([pi.fauxText('ok')])]);

  await runPiAssistantTurn(
    {
      ctx: CTX,
      history: [
        { role: 'assistant', content: 'orphaned opener' },
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
      ],
      userMessage: 'follow-up',
      emit: h.emit,
    },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  // The orphaned opener is dropped: several adapters require messages[0] to be
  // a user message.
  assert.deepEqual(h.rounds[0]!.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok((h.rounds[0]!.systemPrompt ?? '').includes('Available tools:'));
});

// ─── 2. Tool round ───────────────────────────────────────────────────────────

test('tool round dispatches with the AUTH org and loops to a second round', async () => {
  const h = harness([
    pi.fauxAssistantMessage(
      [
        pi.fauxText('Let me check.'),
        // A model-supplied organizationId is just an argument, never authority.
        pi.fauxToolCall('get_order_lookup', { trackingNumber: '1Z999', organizationId: OTHER_ORG }, { id: 'c1' }),
      ],
      { stopReason: 'toolUse' },
    ),
    pi.fauxAssistantMessage([pi.fauxText('Order 55012, delivered Tuesday.')]),
  ]);

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'look up tracking 1Z999', emit: h.emit, runToolBatch: h.runToolBatch },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.equal(out.turns, 2);
  assert.deepEqual(out.toolsUsed, ['get_order_lookup']);
  assert.equal(h.batches, 1, 'one round, one tool batch');

  assert.equal(h.toolCalls.length, 1);
  assert.equal(h.toolCalls[0]!.orgId, ORG, 'dispatch got the authenticated org');
  assert.notEqual(h.toolCalls[0]!.orgId, OTHER_ORG);
  assert.deepEqual(h.toolCalls[0]!.input, { trackingNumber: '1Z999', organizationId: OTHER_ORG });

  const kinds = h.emitted.map((e) => e.type);
  assert.ok(kinds.includes('tool_start'));
  assert.ok(kinds.includes('tool_end'));
  assert.equal(out.text, 'Let me check.\n\nOrder 55012, delivered Tuesday.');

  // Round 2 saw the assistant tool-call turn plus the echoed result.
  const second = h.rounds[1]!;
  assert.equal(second.messages.at(-1)?.role, 'toolResult');
  const echoed = toolResultsIn(second);
  assert.equal(echoed.length, 1);
  assert.equal(echoed[0]!.toolCallId, 'c1');
  assert.equal(echoed[0]!.toolName, 'get_order_lookup');
  assert.equal(echoed[0]!.isError, false);
  assert.match(textOf(echoed[0]!), /rows/);
});

test('a failed tool comes back as an isError result the model can route around', async () => {
  const h = harness(
    [
      pi.fauxAssistantMessage([pi.fauxToolCall('get_kpis', {}, { id: 'c1' })], { stopReason: 'toolUse' }),
      pi.fauxAssistantMessage([pi.fauxText('That read failed; here is what I have.')]),
    ],
    () => ({ ok: false, code: 'tool_error', error: 'get_kpis failed: boom' }),
  );

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'kpis?', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true, 'a tool failure never throws out of the loop');
  const echoed = toolResultsIn(h.rounds[1]!);
  assert.equal(echoed[0]!.isError, true);
  assert.match(textOf(echoed[0]!), /boom/);
  assert.deepEqual(
    h.emitted.filter((e) => e.type === 'tool_end'),
    [{ type: 'tool_end', name: 'get_kpis', ok: false }],
  );
});

// ─── 3. UI tools never reach the registry ────────────────────────────────────

test('render_artifact emits ui_tool_start then ui_tool and never reaches the registry', async () => {
  const h = harness([
    pi.fauxAssistantMessage([pi.fauxToolCall('render_artifact', { artifact: TABLE }, { id: 'c1' })], {
      stopReason: 'toolUse',
    }),
    pi.fauxAssistantMessage([pi.fauxText('On the panel.')]),
  ]);

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'show me open receivings', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.deepEqual(h.toolCalls, [], 'UI tools never reach the tool registry');
  assert.deepEqual(out.toolsUsed, []);

  const ui = h.emitted.filter((e) => e.type === 'ui_tool_start' || e.type === 'ui_tool');
  assert.deepEqual(ui, [
    // The skeleton signal precedes the payload — that is its whole job.
    { type: 'ui_tool_start', name: 'render_artifact' },
    { type: 'ui_tool', name: 'render_artifact', input: { artifact: TABLE } },
  ]);

  const echoed = toolResultsIn(h.rounds[1]!);
  assert.equal(echoed[0]!.isError, false);
  assert.equal(textOf(echoed[0]!), 'Rendered on the session view panel.');
});

test('a non-artifact UI tool is forwarded and acknowledged in the same round', async () => {
  const h = harness([
    pi.fauxAssistantMessage([pi.fauxToolCall('navigate', { path: '/operations' }, { id: 'c1' })], {
      stopReason: 'toolUse',
    }),
    pi.fauxAssistantMessage([pi.fauxText('Opened the operations desk.')]),
  ]);

  await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'open operations', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.deepEqual(h.toolCalls, []);
  assert.deepEqual(
    h.emitted.filter((e) => e.type === 'ui_tool'),
    [{ type: 'ui_tool', name: 'navigate', input: { path: '/operations' } }],
  );
  assert.equal(textOf(toolResultsIn(h.rounds[1]!)[0]!), "Dispatched to the user's browser.");
});

// ─── 4. Tool-carried artifacts: the model never sees the rows ────────────────

test('a report tool renders its own panel and the model is shown only the summary', async () => {
  const REPORT_ROWS = [{ id: 'R-9', carrier: 'FEDEX_SECRET_ROW' }];
  const h = harness(
    [
      pi.fauxAssistantMessage([pi.fauxToolCall('get_unbox_backlog', {}, { id: 'c1' })], { stopReason: 'toolUse' }),
      pi.fauxAssistantMessage([pi.fauxText('Two cartons are waiting; the table is on the panel.')]),
    ],
    () => ({
      ok: true,
      data: {
        artifact: { ...TABLE, title: 'Unbox backlog', rows: REPORT_ROWS },
        summary: 'Two cartons waiting, oldest 3 days.',
      },
    }),
  );

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'how many boxes are left to be unboxed', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.deepEqual(
    h.emitted.filter((e) => e.type === 'ui_tool'),
    [
      {
        type: 'ui_tool',
        name: 'render_artifact',
        input: { artifact: { ...TABLE, title: 'Unbox backlog', rows: REPORT_ROWS } },
      },
    ],
    'the panel gets the exact bytes the tool produced',
  );

  const shown = textOf(toolResultsIn(h.rounds[1]!)[0]!);
  assert.match(shown, /Two cartons waiting, oldest 3 days\./);
  assert.ok(!shown.includes('FEDEX_SECRET_ROW'), 'the report rows are absent from what the model sees');
  assert.ok(!shown.includes('carrier'), 'no column of the payload leaked into the model context');
  // Round 2's whole context must be free of the payload, not just the result.
  assert.ok(!JSON.stringify(h.rounds[1]!.messages).includes('FEDEX_SECRET_ROW'));
});

// ─── 5. Malformed artifact repairs in-turn ───────────────────────────────────

test('a malformed render_artifact payload yields an isError result and emits no ui_tool', async () => {
  const h = harness([
    pi.fauxAssistantMessage(
      // Empty title and no columns: rejected by the artifact contract.
      [pi.fauxToolCall('render_artifact', { artifact: { kind: 'table', title: '', rows: [] } }, { id: 'c1' })],
      { stopReason: 'toolUse' },
    ),
    pi.fauxAssistantMessage([pi.fauxText('Sorry — here it is in words.')]),
  ]);

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'show me a table', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.deepEqual(h.emitted.filter((e) => e.type === 'ui_tool'), [], 'the browser never renders a guess');
  const echoed = toolResultsIn(h.rounds[1]!);
  assert.equal(echoed[0]!.isError, true);
  assert.match(textOf(echoed[0]!), /render_artifact rejected/);
  assert.match(textOf(echoed[0]!), /re-emit, or answer in text/);
  assert.equal(out.text, 'Sorry — here it is in words.');
});

// ─── 6. The turn cap ─────────────────────────────────────────────────────────

test('MAX_PI_TURNS caps a model that only ever calls tools', async () => {
  // A model that never stops calling tools: one more scripted tool round than
  // the cap allows, so only the cap can end the turn.
  const h = harness(
    Array.from({ length: MAX_PI_TURNS + 2 }, () =>
      pi.fauxAssistantMessage([pi.fauxToolCall('get_kpis', {}, { id: 'loop' })], { stopReason: 'toolUse' }),
    ),
  );

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'why are we failing', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, true);
  assert.equal(out.turns, MAX_PI_TURNS);
  assert.equal(h.toolCalls.length, MAX_PI_TURNS);
  assert.match(out.text, /ran out of steps/);
});

// ─── 7. A stream error surfaces ──────────────────────────────────────────────

test('an error event surfaces as { type: "error" } and ok: false', async () => {
  const h = harness([
    pi.fauxAssistantMessage([pi.fauxText('partial answer')], {
      stopReason: 'error',
      errorMessage: 'upstream 503 from the relay',
    }),
  ]);

  const out = await runPiAssistantTurn(
    { ctx: CTX, history: [], userMessage: 'anything?', emit: h.emit },
    { models: h.models, model: h.model, runTool: h.runTool },
  );

  assert.equal(out.ok, false);
  assert.equal(out.error, 'upstream 503 from the relay');
  assert.deepEqual(
    h.emitted.filter((e) => e.type === 'error'),
    [{ type: 'error', message: 'upstream 503 from the relay' }],
  );
});

// ─── Advertisement ───────────────────────────────────────────────────────────

test('piToolsFromRegistry converts Zod and JSON-Schema sources to one shape', () => {
  const tools = piToolsFromRegistry([
    {
      name: 'zod_tool',
      description: 'a registry tool',
      inputSchema: z.object({ q: z.string(), limit: z.number().optional() }),
    },
    {
      name: 'json_tool',
      description: 'a UI tool',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  ]);

  assert.deepEqual(tools.map((t) => t.name), ['zod_tool', 'json_tool']);
  // `Tool.parameters` is typed as the opaque `TSchema`; its RUNTIME value is
  // the JSON Schema, which is the whole point of this conversion — so assert
  // on the serialized bytes instead of fabricating a member-access shape.
  const zodParams = JSON.stringify(tools[0]!.parameters);
  assert.match(zodParams, /"type":"object"/);
  assert.ok(!zodParams.includes('$schema'), '$schema is noise on the wire');
  assert.match(zodParams, /"required":\["q"\]/);
  assert.match(zodParams, /"q":\{"type":"string"\}/);
  assert.match(JSON.stringify(tools[1]!.parameters), /"required":\["path"\]/);
});

test('selfHosted subsets the advertisement; the full list rides otherwise', () => {
  const sources = [
    ...listAssistantTools(CTX),
    ...UI_TOOLS.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      // Anthropic's InputSchema is a nominal wrapper over the same JSON-Schema
      // object the wire helper takes; no runtime check would be meaningful.
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    })),
  ];
  const full = piToolsFromRegistry(sources);
  const subset = piToolsFromRegistry(sources, {
    selfHosted: true,
    userMessage: 'how many boxes are left to be unboxed',
    context: null,
  });

  assert.ok(subset.length < full.length, 'a self-hosted turn advertises fewer verbs');
  assert.ok(subset.some((t) => t.name === 'render_artifact'), 'data answers always land through the panel');
});
