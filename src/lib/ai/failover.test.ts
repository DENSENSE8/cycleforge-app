/** DB-free unit tests for AI provider failover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AiFailoverError, postToAiProvider } from './failover';
import type { OrgAiDeps } from './org-provider';
import { __resetProviderHealth, isProviderDemoted } from './provider-health';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-failover' as OrgId;

function depsFor(vault: Partial<Record<IntegrationProvider, unknown>>): OrgAiDeps {
  return {
    getIntegrationCredentials: async <T,>(_o: OrgId, p: IntegrationProvider) =>
      (vault[p] ?? null) as T | null,
    isAiConfigured: () => false,
    resolveAiConfig: () => {
      throw new Error('no platform default');
    },
    resolveOrder: async () => 'local-first',
    isDemoted: () => false,
  };
}

/** local (ollama) first, then a cloud key — the default local-first shape. */
const LOCAL_THEN_CLOUD = depsFor({
  ollama: { baseUrl: 'http://local/v1', model: 'local-m' },
  openai: { apiKey: 'sk-cloud' },
});

function responder(byHost: Record<string, () => Response | Promise<Response>>) {
  const hits: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    const host = new URL(String(url)).host;
    hits.push(host);
    const fn = byHost[host];
    if (!fn) throw new Error(`unexpected host ${host}`);
    return fn();
  }) as typeof fetch;
  return { fetchImpl, hits };
}

test('the local box answers → cloud is never contacted', async () => {
  __resetProviderHealth();
  const { fetchImpl, hits } = responder({
    'local': () => new Response('{"ok":true}', { status: 200 }),
  });

  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(out.served.source, 'ollama');
  assert.deepEqual(hits, ['local']);
  assert.equal(out.demoted.length, 0);
});

test('local 500 → falls forward to cloud AND the answer is still served', async () => {
  __resetProviderHealth();
  const { fetchImpl, hits } = responder({
    'local': () => new Response('boom', { status: 500 }),
    'api.openai.com': () => new Response('{"ok":true}', { status: 200 }),
  });

  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(out.served.source, 'openai');
  assert.deepEqual(hits, ['local', 'api.openai.com']);
  assert.deepEqual(out.demoted.map((d) => d.source), ['ollama']);
});

test('a Cloudflare Access 403 demotes and falls forward', async () => {
  // The precise failure Phase 0 existed to prevent, now survivable.
  __resetProviderHealth();
  const { fetchImpl } = responder({
    'local': () => new Response('denied', { status: 403 }),
    'api.openai.com': () => new Response('{"ok":true}', { status: 200 }),
  });

  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(out.served.source, 'openai');
});

test('a timeout demotes and falls forward', async () => {
  __resetProviderHealth();
  const { fetchImpl } = responder({
    'local': () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    },
    'api.openai.com': () => new Response('{"ok":true}', { status: 200 }),
  });

  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(out.served.source, 'openai');
});

test('a 400 is RETURNED, not retried — a bad body is not an outage', async () => {
  __resetProviderHealth();
  const { fetchImpl, hits } = responder({
    'local': () => new Response('bad request', { status: 400 }),
  });

  const out = await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(out.res.status, 400);
  assert.equal(out.served.source, 'ollama');
  assert.deepEqual(hits, ['local'], 'must not replay a bad body against every provider');
});

test('a failed provider is demoted so the NEXT request skips the timeout', async () => {
  __resetProviderHealth();
  const { fetchImpl } = responder({
    'local': () => new Response('boom', { status: 503 }),
    'api.openai.com': () => new Response('{"ok":true}', { status: 200 }),
  });

  await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat'), true);
  assert.equal(isProviderDemoted(ORG, 'openai', 'chat'), false);
});

test('demotion is per-capability — a broken embed model does not sideline chat', async () => {
  __resetProviderHealth();
  const { fetchImpl } = responder({
    'local': () => new Response('boom', { status: 500 }),
    'api.openai.com': () => new Response('{"ok":true}', { status: 200 }),
  });

  await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl);

  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat'), true);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'embed'), false);
});

test('a provider that answers is trusted again immediately', async () => {
  __resetProviderHealth();
  const fail = responder({
    'local': () => new Response('boom', { status: 500 }),
    'api.openai.com': () => new Response('ok', { status: 200 }),
  });
  await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fail.fetchImpl);
  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat'), true);

  const ok = responder({ 'local': () => new Response('ok', { status: 200 }) });
  // The chain still contains ollama (demoted sinks, never drops), so a direct
  // recovery is observable without waiting out the TTL.
  const demotedDeps: OrgAiDeps = { ...LOCAL_THEN_CLOUD, isDemoted: () => false };
  await postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, demotedDeps, ok.fetchImpl);

  assert.equal(isProviderDemoted(ORG, 'ollama', 'chat'), false);
});

test('every provider failing throws AiFailoverError naming each attempt', async () => {
  __resetProviderHealth();
  const { fetchImpl } = responder({
    'local': () => new Response('boom', { status: 500 }),
    'api.openai.com': () => new Response('nope', { status: 429 }),
  });

  await assert.rejects(
    () => postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, LOCAL_THEN_CLOUD, fetchImpl),
    (err: AiFailoverError) => {
      assert.equal(err.name, 'AiFailoverError');
      assert.deepEqual(err.attempts.map((a) => a.source), ['ollama', 'openai']);
      assert.match(err.message, /ollama: HTTP 500/);
      assert.match(err.message, /openai: HTTP 429/);
      return true;
    },
  );
});

test('an empty chain is a clear error, not a fetch to nowhere', async () => {
  __resetProviderHealth();
  const empty = depsFor({});
  await assert.rejects(
    () => postToAiProvider(ORG, 'chat', { path: '/chat/completions', body: {} }, empty, (() => {
      throw new Error('must not fetch');
    }) as unknown as typeof fetch),
    /No AI provider is connected/,
  );
});
