/**
 * DB-free unit tests for the AI provider demotion cache.
 *
 * The TTL and the timeout budgets are load-bearing numbers, not taste: both are
 * sized against the measured local-model behaviour on `prometheus` (~14s cold
 * MLX load, 60m idle unload — docs/todo/ai-provider-consolidation-HANDOFF.md).
 * Pin them so a future "tidy up the magic numbers" pass has to argue with a
 * test rather than silently turn local-first back into cloud-first.
 *
 * Run: node --import tsx --test src/lib/ai/provider-health.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetProviderHealth,
  isProviderDemoted,
  markProviderHealthy,
  markProviderUnhealthy,
  PROVIDER_DEMOTION_TTL_MS,
  providerTimeoutMs,
  type HealthClock,
} from './provider-health';

const ORG = 'org-health';

/** Controllable clock so the TTL is testable without sleeping. */
function clockAt(start = 1_000_000): HealthClock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('a demoted provider is demoted', () => {
  __resetProviderHealth();
  const clock = clockAt();
  markProviderUnhealthy(ORG, 'ollama', 'chat', clock);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat', clock), true);
});

test('the demotion expires once the TTL elapses', () => {
  __resetProviderHealth();
  const clock = clockAt();
  markProviderUnhealthy(ORG, 'ollama', 'chat', clock);

  clock.advance(PROVIDER_DEMOTION_TTL_MS - 1);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat', clock), true, 'still inside the window');

  clock.advance(2);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat', clock), false, 'window elapsed');
});

test('demotion is scoped per ORG — one tenant does not sideline another', () => {
  __resetProviderHealth();
  const clock = clockAt();
  markProviderUnhealthy(ORG, 'ollama', 'chat', clock);
  assert.equal(isProviderDemoted('other-org', 'ollama', 'chat', clock), false);
});

test('demotion is scoped per CAPABILITY', () => {
  __resetProviderHealth();
  const clock = clockAt();
  markProviderUnhealthy(ORG, 'ollama', 'embed', clock);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat', clock), false);
});

test('a provider that answers is trusted again immediately', () => {
  __resetProviderHealth();
  const clock = clockAt();
  markProviderUnhealthy(ORG, 'ollama', 'chat', clock);
  markProviderHealthy(ORG, 'ollama', 'chat');
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat', clock), false);
});

test('the LOCAL timeout budget exceeds the measured ~14s cold JIT load', () => {
  // A uniform short timeout would demote a perfectly healthy self-hosted model
  // on the first request after each 60m unload — i.e. local-first would quietly
  // become cloud-first for anyone whose box idles, which is everyone.
  assert.ok(
    providerTimeoutMs('ollama') > 14_000,
    `local budget ${providerTimeoutMs('ollama')}ms must exceed the ~14s cold load`,
  );
});

test('cloud providers fail fast — they have no cold-start of that shape', () => {
  assert.ok(providerTimeoutMs('openai') < providerTimeoutMs('ollama'));
  assert.ok(providerTimeoutMs('platform') < providerTimeoutMs('ollama'));
  assert.ok(providerTimeoutMs('ai_gateway') < providerTimeoutMs('ollama'));
});

test('the demotion window is longer than one cold load and shorter than the idle unload', () => {
  // Shorter than a cold load ⇒ a warming box is retried into the same timeout.
  // Longer than the 60m unload ⇒ a recovered box stays sidelined for an hour.
  assert.ok(PROVIDER_DEMOTION_TTL_MS > 14_000);
  assert.ok(PROVIDER_DEMOTION_TTL_MS < 60 * 60_000);
});
