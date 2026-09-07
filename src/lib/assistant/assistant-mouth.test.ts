/**
 * The assistant mouth ladder. The load-bearing assertion is the first suite:
 * every provider the chain can resolve gets a mouth that can call a tool.
 *
 * Before `assistant-mouth.ts`, four of the six sources answered through a bare
 * `/chat/completions` stream with no `tools` array — so on a plain Vercel deploy
 * (`platform`) the assistant could not call a registered verb, could not emit
 * `render_artifact`, and the entire right-hand artifact canvas never painted.
 * These rows fail against that ladder.
 *
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAssistantMouth,
  mouthCanCallTools,
  type AssistantMouthInputs,
} from './assistant-mouth';
import type { OrgAiConfig } from '@/lib/ai/org-provider';

/** Every `source` `resolveOrgAiChain` can put at the head of the chain. */
const CHAIN_SOURCES = [
  'ollama',
  'grok',
  'ai_gateway',
  'openai',
  'anthropic',
  'platform',
] as const satisfies readonly OrgAiConfig['source'][];

function config(source: OrgAiConfig['source']): OrgAiConfig {
  return {
    source,
    baseURL: source === 'ollama' ? 'http://prometheus:8080/v1' : `https://${source}.example/v1`,
    apiKey: source === 'ollama' ? '' : 'k',
    model: 'test-model',
  };
}

const BASE: AssistantMouthInputs = {
  grokConfig: null,
  hasAnthropic: false,
  chatConfig: null,
  chatReachable: false,
  forceWireFallback: false,
  classifiedFacts: false,
};

// ─── The invariant ───────────────────────────────────────────────────────────

for (const source of CHAIN_SOURCES) {
  test(`a reachable ${source} provider gets a tool-capable mouth`, () => {
    const chat = config(source);
    const mouth = chooseAssistantMouth({
      ...BASE,
      chatConfig: chat,
      chatReachable: true,
      grokConfig: source === 'grok' ? chat : null,
    });
    assert.equal(
      mouthCanCallTools(mouth),
      true,
      `${source} was answered by '${mouth.kind}', which cannot call render_artifact`,
    );
    assert.equal(mouth.kind, 'wire-tools');
  });
}

test('an Anthropic brain alongside a reachable wire keeps the wire tool loop', () => {
  // `hasAnthropic` suppresses the wire (the native protocol is better on
  // Claude), so this lands on the native loop — still tool-capable.
  const mouth = chooseAssistantMouth({
    ...BASE,
    hasAnthropic: true,
    chatConfig: config('ai_gateway'),
    chatReachable: true,
  });
  assert.equal(mouth.kind, 'anthropic-tools');
  assert.equal(mouthCanCallTools(mouth), true);
});

// ─── Precedence that must not drift ──────────────────────────────────────────

test('a connected Grok session outranks a self-hosted slot and an Anthropic brain', () => {
  const grok = config('grok');
  const mouth = chooseAssistantMouth({
    ...BASE,
    grokConfig: grok,
    hasAnthropic: true,
    chatConfig: grok,
    chatReachable: true,
  });
  assert.deepEqual(mouth, { kind: 'wire-tools', config: grok, refreshable: true });
});

test('a self-hosted slot outranks a metered Anthropic brain (local-first)', () => {
  const local = config('ollama');
  const mouth = chooseAssistantMouth({
    ...BASE,
    hasAnthropic: true,
    chatConfig: local,
    chatReachable: true,
  });
  assert.deepEqual(mouth, { kind: 'wire-tools', config: local, refreshable: false });
});

test('only Grok is refreshable — a pinned endpoint has no OAuth session to rotate', () => {
  const gateway = config('ai_gateway');
  const mouth = chooseAssistantMouth({ ...BASE, chatConfig: gateway, chatReachable: true });
  assert.deepEqual(mouth, { kind: 'wire-tools', config: gateway, refreshable: false });
});

test('an unreachable endpoint falls through to the Anthropic brain', () => {
  const mouth = chooseAssistantMouth({
    ...BASE,
    hasAnthropic: true,
    chatConfig: config('ai_gateway'),
    chatReachable: false,
  });
  assert.equal(mouth.kind, 'anthropic-tools');
});

test('the force flag takes the wire even with an Anthropic brain present', () => {
  const gateway = config('ai_gateway');
  const mouth = chooseAssistantMouth({
    ...BASE,
    hasAnthropic: true,
    forceWireFallback: true,
    chatConfig: gateway,
    chatReachable: true,
  });
  assert.deepEqual(mouth, { kind: 'wire-tools', config: gateway, refreshable: false });
});

// ─── The phrasing shortcut ───────────────────────────────────────────────────

test('a classified turn on a managed mouth phrases instead of running a tool round', () => {
  const gateway = config('ai_gateway');
  const mouth = chooseAssistantMouth({
    ...BASE,
    classifiedFacts: true,
    chatConfig: gateway,
    chatReachable: true,
  });
  assert.deepEqual(mouth, { kind: 'phrasing', config: gateway });
  assert.equal(mouthCanCallTools(mouth), false);
});

test('a classified turn yields to a self-hosted tool loop — it is free and it can verify', () => {
  const local = config('ollama');
  const mouth = chooseAssistantMouth({
    ...BASE,
    classifiedFacts: true,
    chatConfig: local,
    chatReachable: true,
  });
  assert.deepEqual(mouth, { kind: 'wire-tools', config: local, refreshable: false });
});

test('a classified turn with no reachable wire still gets the Anthropic tool loop', () => {
  const mouth = chooseAssistantMouth({
    ...BASE,
    classifiedFacts: true,
    hasAnthropic: true,
    chatConfig: config('ai_gateway'),
    chatReachable: false,
  });
  assert.equal(mouth.kind, 'anthropic-tools');
});

// ─── Honest absence ──────────────────────────────────────────────────────────

test('nothing configured reports unconfigured rather than guessing a provider', () => {
  assert.deepEqual(chooseAssistantMouth(BASE), { kind: 'unconfigured' });
});

test('a resolved but unreachable endpoint with no brain is unconfigured', () => {
  const mouth = chooseAssistantMouth({
    ...BASE,
    chatConfig: config('platform'),
    chatReachable: false,
  });
  assert.deepEqual(mouth, { kind: 'unconfigured' });
});
