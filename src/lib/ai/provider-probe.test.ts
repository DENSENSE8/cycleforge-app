/** DB-free unit tests for the save-time AI endpoint probe. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelWarning, probeAiEndpoint } from './provider-probe';

function respondWith(fn: () => Response | Promise<Response>) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return fn();
  }) as typeof fetch;
  return { fetchImpl, seen };
}

test('a listing endpoint returns its models', async () => {
  const { fetchImpl, seen } = respondWith(
    () => new Response(JSON.stringify({ data: [{ id: 'llama3' }, { id: 'nomic-embed-text' }] }), { status: 200 }),
  );

  const out = await probeAiEndpoint({ baseURL: 'https://ai.example.com/v1/' }, fetchImpl);

  assert.deepEqual(out, { ok: true, models: ['llama3', 'nomic-embed-text'] });
  assert.equal(seen[0]!.url, 'https://ai.example.com/v1/models', 'trailing slash normalised');
});

test('a 404 on /models is SUCCESS — not every server implements it', async () => {
  // Rejecting a working endpoint for lacking an optional listing API would be a
  // worse bug than the unreachable-URL one this probe exists to catch.
  const { fetchImpl } = respondWith(() => new Response('nope', { status: 404 }));

  const out = await probeAiEndpoint({ baseURL: 'https://ai.example.com/v1' }, fetchImpl);

  assert.equal(out.ok, true);
});

test('a 401 is a FAILURE and the message names the credential to check', async () => {
  const { fetchImpl } = respondWith(() => new Response('denied', { status: 401 }));

  const out = await probeAiEndpoint({ baseURL: 'https://ai.example.com/v1' }, fetchImpl);

  assert.equal(out.ok, false);
  assert.match((out as { reason: string }).reason, /API key/);
});

test('a 403 names Cloudflare Access — the misconfiguration that motivated headers', async () => {
  const { fetchImpl } = respondWith(() => new Response('denied', { status: 403 }));

  const out = await probeAiEndpoint({ baseURL: 'https://ai.example.com/v1' }, fetchImpl);

  assert.equal(out.ok, false);
  assert.match((out as { reason: string }).reason, /Cloudflare Access/);
});

test('an unreachable host explains that localhost is not visible to the server', async () => {
  // The exact failure the probe exists for.
  const { fetchImpl } = respondWith(() => {
    throw new Error('ECONNREFUSED');
  });

  const out = await probeAiEndpoint({ baseURL: 'http://localhost:11434/v1' }, fetchImpl);

  assert.equal(out.ok, false);
  assert.match((out as { reason: string }).reason, /tunnel/i);
});

test('a timeout suggests a tunnel rather than blaming the model', async () => {
  const { fetchImpl } = respondWith(() => {
    throw Object.assign(new Error('slow'), { name: 'TimeoutError' });
  });

  const out = await probeAiEndpoint({ baseURL: 'http://10.0.0.5:11434/v1' }, fetchImpl);

  assert.equal(out.ok, false);
  assert.match((out as { reason: string }).reason, /tunnel/i);
});

test('a malformed URL fails before any fetch is attempted', async () => {
  const out = await probeAiEndpoint({ baseURL: 'notaurl' }, (() => {
    throw new Error('must not fetch');
  }) as unknown as typeof fetch);

  assert.equal(out.ok, false);
});

test('CF Access headers are SENT on the probe, so the probe tests what runtime will do', async () => {
  const { fetchImpl, seen } = respondWith(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));

  await probeAiEndpoint(
    {
      baseURL: 'https://ai.example.com/v1',
      apiKey: 'model-key',
      headers: { 'CF-Access-Client-Id': 'cf-id' },
    },
    fetchImpl,
  );

  assert.equal(seen[0]!.headers['CF-Access-Client-Id'], 'cf-id');
  assert.equal(seen[0]!.headers.Authorization, 'Bearer model-key');
});

test('unreadable JSON still counts as reachable', async () => {
  const { fetchImpl } = respondWith(() => new Response('<html>', { status: 200 }));

  const out = await probeAiEndpoint({ baseURL: 'https://ai.example.com/v1' }, fetchImpl);

  assert.equal(out.ok, true);
});

test('modelWarning flags a named model the endpoint does not list', () => {
  assert.match(modelWarning(['llama3'], 'qwen3')!, /does not currently list "qwen3"/);
});

test('modelWarning stays silent when it cannot know — empty list or no model named', () => {
  // A warning here would be noise: the listing may be unimplemented, and a
  // model can be pulled after connecting.
  assert.equal(modelWarning([], 'qwen3'), null);
  assert.equal(modelWarning(['llama3'], undefined), null);
  assert.equal(modelWarning(['llama3'], 'llama3'), null);
});
