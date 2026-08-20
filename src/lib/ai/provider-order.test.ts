/**
 * DB-free unit tests for the per-org AI provider ORDER preference.
 * Run: node --import tsx --test src/lib/ai/provider-order.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiProviderSequence,
  normalizeAiProviderOrder,
  resolveAiProviderOrder,
} from './provider-order';

test('the product default is local-first when nothing is configured', () => {
  assert.equal(resolveAiProviderOrder({ orgOrder: null, envOrder: null }), 'local-first');
});

test('the org setting beats the env default', () => {
  assert.equal(
    resolveAiProviderOrder({ orgOrder: 'cloud-first', envOrder: 'local-first' }),
    'cloud-first',
  );
});

test('env is used only when the org has not chosen', () => {
  assert.equal(resolveAiProviderOrder({ orgOrder: null, envOrder: 'cloud-first' }), 'cloud-first');
});

test('an unrecognised value falls through rather than throwing', () => {
  assert.equal(resolveAiProviderOrder({ orgOrder: 'sideways', envOrder: null }), 'local-first');
  assert.equal(normalizeAiProviderOrder('sideways'), null);
  assert.equal(normalizeAiProviderOrder('  '), null);
});

test('accepts the short spellings a UI or env is likely to carry', () => {
  assert.equal(normalizeAiProviderOrder('LOCAL'), 'local-first');
  assert.equal(normalizeAiProviderOrder('self-hosted'), 'local-first');
  assert.equal(normalizeAiProviderOrder('Cloud'), 'cloud-first');
});

test('local-first puts the self-hosted slot ahead of every cloud provider', () => {
  assert.deepEqual(aiProviderSequence('local-first', 'chat'), [
    'ollama',
    'ai_gateway',
    'openai',
    'anthropic',
  ]);
});

test('cloud-first is the OLD hardcoded chain, exactly — one entry moves', () => {
  // Pins that flipping the preference relocates `ollama` and reorders nothing
  // else, so a tenant opting out of the inversion gets the previous behaviour.
  assert.deepEqual(aiProviderSequence('cloud-first', 'chat'), [
    'ai_gateway',
    'openai',
    'anthropic',
    'ollama',
  ]);
});

test('embed drops anthropic in BOTH orders (it has no embeddings API)', () => {
  assert.deepEqual(aiProviderSequence('local-first', 'embed'), ['ollama', 'ai_gateway', 'openai']);
  assert.deepEqual(aiProviderSequence('cloud-first', 'embed'), ['ai_gateway', 'openai', 'ollama']);
});
