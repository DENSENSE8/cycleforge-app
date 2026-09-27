/**
 * In-turn failover contract of the OpenAI-wire loop: an endpoint that fails
 * before the operator saw anything hands the turn back for the next provider;
 * anything later is a visible error.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/assistant/grok-agent-loop.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrokWireError, isEndpointFailure, runGrokAssistantTurn, type GrokLoopDeps } from './grok-agent-loop';
import type { AssistantEmit } from './agent-loop';

const ctx = { organizationId: '11111111-2222-3333-4444-555555555555', staffId: 7, permissions: new Set<string>() };

function run(streamTurn: GrokLoopDeps['streamTurn'], canFailOver: boolean) {
  const events: AssistantEmit[] = [];
  const deps: GrokLoopDeps = { streamTurn, runTool: async () => ({ ok: true, data: {} }) };
  return runGrokAssistantTurn({ ctx, history: [], userMessage: 'Where is SKU 1?', emit: (e) => events.push(e), canFailOver }, deps).then(
    (result) => ({ result, events }),
  );
}

const quota = async () => {
  throw new GrokWireError('Model endpoint returned 429: daily free allocation used up', 429, true);
};

test('isEndpointFailure: wire HTTP failures and network failures, never ordinary bugs', () => {
  assert.equal(isEndpointFailure(new GrokWireError('x', 429, true)), true);
  assert.equal(isEndpointFailure(new GrokWireError('x', 503, false)), true);
  assert.equal(isEndpointFailure(new TypeError('fetch failed')), true);
  assert.equal(isEndpointFailure(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
  assert.equal(isEndpointFailure(new TypeError("Cannot read properties of undefined (reading 'x')")), false);
  assert.equal(isEndpointFailure('boom'), false);
});

test('a quota 429 on the first round fails over silently when a next candidate exists', async () => {
  const { result, events } = await run(quota, true);
  assert.equal(result.failedOver, true);
  assert.equal(result.ok, false);
  assert.deepEqual(events.map((e) => e.type), ['step'], 'only the opening step — which the route holds back');
});

test('the same 429 with nowhere to fail over to is an operator-visible error', async () => {
  const { result, events } = await run(quota, false);
  assert.equal(result.failedOver, undefined);
  assert.ok(events.some((e) => e.type === 'error' && /429/.test(e.message)));
});

test('an endpoint that dies after text reached the operator is NOT replayed elsewhere', async () => {
  const { result, events } = await run(async (_params, onTextDelta) => {
    onTextDelta('Let me check');
    throw new GrokWireError('Model endpoint returned 502', 502, false);
  }, true);
  assert.equal(result.failedOver, undefined);
  assert.ok(events.some((e) => e.type === 'delta'));
  assert.ok(events.some((e) => e.type === 'error'));
});

test('a stop mid-round keeps the partial answer, sums reported usage, and is neither an error nor a failover', async () => {
  const stop = new AbortController();
  const events: AssistantEmit[] = [];
  let round = 0;
  const deps: GrokLoopDeps = {
    runTool: async () => ({ ok: true, data: { found: true } }),
    streamTurn: async (_params, onTextDelta) => {
      round += 1;
      if (round === 1) {
        return {
          text: '',
          toolCalls: [{ id: 'c1', name: 'locate_product', arguments: '{"query":"00066-P-2"}' }],
          finishReason: 'tool_calls',
          usage: { promptTokens: 100, completionTokens: 10 },
        };
      }
      onTextDelta('It is in bin');
      stop.abort();
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    },
  };
  const result = await runGrokAssistantTurn(
    { ctx, history: [], userMessage: 'Where is SKU 00066-P-2?', emit: (e) => events.push(e), canFailOver: true, signal: stop.signal },
    deps,
  );
  assert.equal(result.stopped, true);
  assert.equal(result.failedOver, undefined);
  assert.equal(result.text, 'It is in bin');
  assert.deepEqual(result.usage, { promptTokens: 100, completionTokens: 10 });
  assert.ok(!events.some((e) => e.type === 'error'));
});

test('an already-stopped turn spends no round', async () => {
  const stop = new AbortController();
  stop.abort();
  let rounds = 0;
  const deps: GrokLoopDeps = {
    runTool: async () => ({ ok: true, data: {} }),
    streamTurn: async () => {
      rounds += 1;
      return { text: 'x', toolCalls: [], finishReason: 'stop' };
    },
  };
  const result = await runGrokAssistantTurn({ ctx, history: [], userMessage: 'hi', emit: () => {}, signal: stop.signal }, deps);
  assert.equal(rounds, 0);
  assert.equal(result.stopped, true);
  assert.equal(result.usage, null);
});
