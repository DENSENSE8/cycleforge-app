/** DB-free unit tests for the AI provider demotion cache. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetProviderHealth,
  createProviderHealth,
  isProviderDemoted,
  markProviderHealthy,
  markProviderUnhealthy,
  PROVIDER_DEMOTION_TTL_MS,
  providerTimeoutMs,
  type HealthClock,
  type ProviderHealthDeps,
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

// ─── Shared (Redis) demotion across instances ───────────────────────────────

/** In-memory stand-in for Upstash: SET … PX / DEL / EXISTS with expiry on the test clock. */
function fakeRedis(clock: HealthClock) {
  const store = new Map<string, number>();
  const commands: (string | number)[][] = [];
  const pipeline: ProviderHealthDeps['pipeline'] = async (cmds) =>
    cmds.map((cmd) => {
      commands.push(cmd);
      const [op, k] = cmd as [string, string];
      const alive = (store.get(k) ?? -Infinity) > clock.now();
      if (op === 'SET') {
        store.set(k, clock.now() + Number(cmd[4]));
        return 'OK';
      }
      if (op === 'DEL') return store.delete(k) && alive ? 1 : 0;
      if (op === 'EXISTS') return alive ? 1 : 0;
      throw new Error(`unexpected ${op}`);
    });
  return { pipeline, commands };
}

test('a demotion on one instance is visible to a SECOND instance through the shared store', async () => {
  const clock = clockAt();
  const redis = fakeRedis(clock);
  const a = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });
  const b = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });

  a.markUnhealthy(ORG, 'ollama', 'chat', clock);

  assert.equal(b.isDemoted(ORG, 'ollama', 'chat', clock), false, "b's own map never saw the failure");
  assert.equal(await b.isDemotedShared(ORG, 'ollama', 'chat', clock), true);
  assert.equal(await b.isDemotedShared(ORG, 'ollama', 'embed', clock), false, 'capability-scoped');
  assert.equal(await b.isDemotedShared('other-org', 'ollama', 'chat', clock), false, 'org-scoped');
  assert.equal(await b.isDemotedShared(ORG, 'openai', 'chat', clock), false, 'source-scoped');

  clock.advance(PROVIDER_DEMOTION_TTL_MS);
  assert.equal(await b.isDemotedShared(ORG, 'ollama', 'chat', clock), false, 'shared entry carries the 60s TTL');
});

test('a recovery on one instance clears the shared demotion for the others', async () => {
  const clock = clockAt();
  const redis = fakeRedis(clock);
  const a = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });
  const b = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });

  a.markUnhealthy(ORG, 'ollama', 'chat', clock);
  b.markHealthy(ORG, 'ollama', 'chat');

  const c = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });
  assert.equal(await c.isDemotedShared(ORG, 'ollama', 'chat', clock), false);
});

test('a locally-known demotion answers without a shared round-trip', async () => {
  const clock = clockAt();
  const redis = fakeRedis(clock);
  const a = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => true });
  a.markUnhealthy(ORG, 'ollama', 'chat', clock);
  const before = redis.commands.length;

  assert.equal(await a.isDemotedShared(ORG, 'ollama', 'chat', clock), true);
  assert.equal(redis.commands.length, before);
});

test('with the shared store DISABLED, demotion is memory-only and Redis is never called', async () => {
  const clock = clockAt();
  const redis = fakeRedis(clock);
  const a = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => false });
  const b = createProviderHealth({ pipeline: redis.pipeline, sharedEnabled: () => false });

  a.markUnhealthy(ORG, 'ollama', 'chat', clock);

  assert.equal(await a.isDemotedShared(ORG, 'ollama', 'chat', clock), true, 'local memory still demotes');
  assert.equal(await b.isDemotedShared(ORG, 'ollama', 'chat', clock), false);
  assert.equal(redis.commands.length, 0);
});

test('a THROWING shared store falls back to memory — marks stay sync and never throw', async () => {
  const clock = clockAt();
  const syncThrow = createProviderHealth({
    pipeline: () => {
      throw new Error('fetch exploded');
    },
    sharedEnabled: () => true,
  });
  const rejects = createProviderHealth({
    pipeline: async () => {
      throw new Error('upstash pipeline failed: 503');
    },
    sharedEnabled: () => true,
  });

  for (const h of [syncThrow, rejects]) {
    assert.equal(h.markUnhealthy(ORG, 'ollama', 'chat', clock), undefined);
    assert.equal(await h.isDemotedShared(ORG, 'ollama', 'chat', clock), true, 'local write-through survived');
    assert.equal(await h.isDemotedShared(ORG, 'openai', 'chat', clock), false, 'store error reads as not demoted');
    h.markHealthy(ORG, 'ollama', 'chat');
    assert.equal(await h.isDemotedShared(ORG, 'ollama', 'chat', clock), false);
  }
});

test('a HUNG shared store costs at most the read budget, then answers from memory', async () => {
  const clock = clockAt();
  const h = createProviderHealth({
    pipeline: () => Promise.withResolvers<unknown[]>().promise,
    sharedEnabled: () => true,
    readBudgetMs: 20,
  });

  const started = performance.now();
  assert.equal(await h.isDemotedShared(ORG, 'ollama', 'chat', clock), false);
  assert.ok(performance.now() - started < 1_000, 'bounded by the read budget, not a hang');
});
