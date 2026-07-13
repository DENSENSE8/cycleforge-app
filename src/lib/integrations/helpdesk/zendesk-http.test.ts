import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRetryAfter,
  zendeskHttpRequest,
  resetZendeskHttpStateForTests,
  getZendeskHttpClientStatus,
  ZENDESK_HTTP_CONFIG,
} from './zendesk-http';

const AUTH = { subdomain: 'usav', user: 'ops@example.com', apiToken: 'test-token' };

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    return handler(href, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

test('parseRetryAfter: seconds and HTTP-date', () => {
  assert.equal(parseRetryAfter('12'), 12_000);
  const future = new Date(Date.now() + 5_000).toUTCString();
  const parsed = parseRetryAfter(future);
  assert.ok(parsed != null && parsed >= 0 && parsed <= 5_500);
  assert.equal(parseRetryAfter(null), null);
});

test('zendeskHttpRequest: retries 429 using Retry-After then succeeds', async () => {
  resetZendeskHttpStateForTests();
  let calls = 0;
  const restore = stubFetch(() => {
    calls += 1;
    if (calls === 1) {
      return new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    }
    return new Response(JSON.stringify({ ticket: { id: 9410, subject: 'ok' } }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-rate-limit-remaining': '50',
      },
    });
  });
  try {
    const data = await zendeskHttpRequest<{ ticket: { id: number } }>(
      AUTH,
      'GET',
      '/api/v2/tickets/9410.json',
    );
    assert.equal(data.ticket.id, 9410);
    assert.equal(calls, 2);
  } finally {
    restore();
    resetZendeskHttpStateForTests();
  }
});

test('zendeskHttpRequest: dedupes concurrent identical GETs', async () => {
  resetZendeskHttpStateForTests();
  let calls = 0;
  const restore = stubFetch(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return new Response(JSON.stringify({ ticket: { id: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-rate-limit-remaining': '99' },
    });
  });
  try {
    const [a, b] = await Promise.all([
      zendeskHttpRequest(AUTH, 'GET', '/api/v2/tickets/1.json'),
      zendeskHttpRequest(AUTH, 'GET', '/api/v2/tickets/1.json'),
    ]);
    assert.deepEqual(a, b);
    assert.equal(calls, 1, 'in-flight dedup should collapse to one upstream fetch');
  } finally {
    restore();
    resetZendeskHttpStateForTests();
  }
});

test('zendeskHttpRequest: opens circuit after repeated 429s', async () => {
  resetZendeskHttpStateForTests();
  const restore = stubFetch(() =>
    new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }),
  );
  try {
    const attempts = ZENDESK_HTTP_CONFIG.maxRetries + 2;
    let sawCircuit = false;
    for (let i = 0; i < attempts; i++) {
      try {
        await zendeskHttpRequest(AUTH, 'GET', `/api/v2/tickets/${i}.json`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'ZendeskCircuitOpenError') {
          sawCircuit = true;
          break;
        }
      }
    }
    const status = getZendeskHttpClientStatus();
    assert.equal(sawCircuit || status.circuit.isOpen, true);
  } finally {
    restore();
    resetZendeskHttpStateForTests();
  }
});
